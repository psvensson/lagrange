/**
 * Partition Service - SQLite-backed Raft group for data storage.
 * Implements table partitions with Raft consensus for replication.
 * Uses liferaft library for Raft consensus with simplified transport.
 * Requirements: 1.4, 3.2, 3.3, 3.4, 3.5, 4.4, 8.1, 10.1, 35.1, 35.5
 */

import {EventEmitter} from 'events';
import {randomUUID} from 'node:crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import LifeRaft from '../raft/liferaft.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  PRESSURE_WORK_CLASS,
} from '../control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  ControlPlaneSystemTableGateway,
} from '../control-plane/control-plane-system-table-gateway.js';
import {LoggingService} from '../logging/logging-service.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {UnifiedRebalancer, EntityType} from '../rebalancer/unified-rebalancer.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {assertCritical} from '../utils/assert.js';
import {PendingRequestTracker} from './pending-request-tracker.js';
import {CDCEventBuffer} from './cdc-event-buffer.js';
import {
  extractInsertDataFromSQL as extractInsertDataFromSQLImpl,
  extractUpdateDataFromSQL as extractUpdateDataFromSQLImpl,
  extractDeleteDataFromSQL as extractDeleteDataFromSQLImpl,
  extractDataFromParameterizedSQL as extractDataFromParameterizedSQLImpl,
  parseValuesFromSQL as parseValuesFromSQLImpl,
  parseValue as parseValueImpl,
} from './partition-sql-parser.js';
import {PartitionCDCDelivery} from './partition-cdc-delivery.js';
import {CDCPipelineMetrics} from '../cdc/cdc-pipeline-metrics.js';
import {
  CDC_PIPELINE_METRIC,
  CDC_LIFECYCLE_LOG_MSG,
} from '../constants/cdc-lifecycle-constants.js';
import {isRaftPacket} from '../raft/raft-packet-utils.js';
import {SQLiteLogAdapter} from '../raft/sqlite-log-adapter.js';
import {assertRaftProviderContract} from '../raft/raft-provider-contract.js';
import {LiferaftProvider} from '../raft/liferaft-provider.js';
import {AuthoritativeRowMutationHelper} from '../raft/authoritative-row-mutation-helper.js';
import {
  wireReplicaLifecycleEvents,
} from '../raft/replica-leadership-state.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';
import {
  applyRuntimeRaftTiming,
  computeReplicaElectionTimeouts,
} from '../raft/raft-timing-utils.js';
import {LeaderActivationGate} from '../raft/leader-activation-gate.js';
import {LeaderActivationScheduler} from '../raft/leader-activation-scheduler.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  attachTrafficReadinessListener,
  isBackgroundWorkReady as isBackgroundWorkLifecycleReady,
  isMetadataPublicationReady as isMetadataPublicationLifecycleReady,
} from '../bootstrap/traffic-readiness-utils.js';
import {AddressManager} from '../address/address-manager.js';
import {isSystemTableWriteReady} from '../cache/leader-readiness-gate.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {
  COLUMN,
  CDC_OPERATION,
  ENTITY_TYPE,
  ERRORS,
  METRICS_LOG_TAG,
  NUM,
  SQL,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STRING,
  TABLES,
} from '../constants/index.js';
import {
  PARTITION_RAFT_ROLE,
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_STATE,
  PARTITION_SUBSYSTEM,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from './partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
} from './split-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../workflow/workflow-constants.js';
import {
  PARTITION_SERVICE_ADDRESS,
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_DB,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_INIT_STAGE,
  PARTITION_SERVICE_LIFERAFT_TIMER,
  PARTITION_SERVICE_MIGRATION_OPERATION,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_REASON,
  PARTITION_SERVICE_RESPONSE,
  PARTITION_SERVICE_ROLE,
  PARTITION_SERVICE_SQL,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_STATUS,
  PARTITION_SERVICE_TYPE,
  PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';
import {
  PartitionRaftStorage,
  PartitionRaftLogEntry,
} from './partition-raft-storage.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../control-plane/timeout-budget.js';

/**
 * Partition state enumeration.
 */
const PartitionState = PARTITION_STATE;

/**
 * Raft role enumeration.
 */
const RaftRole = PARTITION_RAFT_ROLE;

const CONTROL_PLANE_PARTITION_IDS = new Set(
  Object.values(INITIAL_PARTITION_IDS),
);

/**
 * CDC operation types.
 */
const CDCOperation = CDC_OPERATION;

const ACTIVE_VOTER_ROLES = new Set([
  PARTITION_RAFT_ROLE.LEADER,
  PARTITION_RAFT_ROLE.FOLLOWER,
  PARTITION_RAFT_ROLE.CANDIDATE,
]);
const WRITE_PHASE_FIELD_ENTRY_BUILD_MS = 'entryBuildMs';
const WRITE_PHASE_FIELD_LOG_APPEND_MS = 'logAppendMs';
const WRITE_PHASE_FIELD_SQLITE_RUN_MS = 'sqliteRunMs';
const WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS = 'raftCommandDispatchMs';
const WRITE_PHASE_FIELD_FORWARD_DELIVER_MS = 'forwardDeliverMs';
const WRITE_PHASE_FIELD_APPLY_WRITE_MS = 'applyWriteMs';
const WRITE_PHASE_FIELD_TOTAL_MS = 'totalMs';
const SPLIT_SNAPSHOT_BACKFILL_YIELD_EVERY_ROWS = 64;
const DEFAULT_TRANSACTION_SESSION_ID = 'default';
const QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION = 'migrationOperation';
const QUERY_PAYLOAD_FIELD_MIGRATION_ID = 'migrationId';
const PARTITION_REPLICA_COUNT_FIELD = 'replica_count';
const FLUSH_SKIP_SETTLING = 'settling';
const CRITICAL_SYSTEM_PARTITION_IDS = new Set(
  Object.values(SYSTEM_TABLE_NAME).map((tableName) => `${tableName}-p1`),
);


/**
 * PartitionService implements a SQLite-backed Raft group for data storage.
 * Each partition is a Raft consensus group with odd-numbered replicas.
 */
class PartitionService extends EventEmitter {
  /**
   * Create a new PartitionService.
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Partition ID.
   * @param {string} options.tableId - Table ID this partition belongs to.
   * @param {string} options.tableName - Table name.
   * @param {Object} options.schema - Table schema definition.
   * @param {Object} options.keyRange - Partition key range {start, end}.
   * @param {string} options.replicaId - This replica's ID.
   * @param {Array<string>} options.replicaIds - All replica IDs in the partition.
   * @param {string} options.nodeId - Node ID hosting this replica.
   * @param {Object} options.transport - MessageRouter for Raft communication.
   * @param {string} options.dbPath - Path to SQLite database file.
   * @param {Object} options.messageGroupService - Message group service for lifecycle messages.
   */
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
      typeof options.externalCdcAllowed === 'boolean' ?
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
      typeof options.leaderAddress === 'string' && options.leaderAddress.length > NUM.ZERO ?
        options.leaderAddress :
        null;

    // Unified address format: {nodeId}/partition/{replicaId}
    // Requirements: 1.1, 1.4, 5.1
    const addressManager = AddressManager.getInstance();
    this.unifiedAddress = addressManager.format(this.nodeId, ENTITY_TYPE.PARTITION, this.replicaId);

    // Configuration
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
        (
          config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS) ??
          250
        );
    this.leaderActivationNodeSpacingMs =
      Number.isFinite(options.leaderActivationNodeSpacingMs) &&
      options.leaderActivationNodeSpacingMs >= NUM.ZERO ?
        Math.floor(options.leaderActivationNodeSpacingMs) :
        (
          config.get(CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS) ??
          25
        );

    // SQLite database
    this.db = null;
    this.storage = null;

    // Raft state - liferaft handles election/heartbeat timers internally
    // Requirements: 11.9
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;

    // Partition state
    this.state = PartitionState.NORMAL;

    // Size tracking
    this.sizeBytes = NUM.ZERO;
    this.sizeUpdatePending = false;
    this.lastSizeUpdate = NUM.ZERO;
    this.sizeUpdateTimer = null;

    // CDC subscribers
    this.cdcSubscribers = new Set();
    this.cdcSubscriberWrappers = new Map();
    this.cdcSubscriberStates = new Map();
    this.cdcSubscriptionEpoch = NUM.ZERO;
    this.cdcEventSequenceNumber = NUM.ZERO;
    // CDC event buffer for events generated before subscribers register
    this.cdcEventBuffer = new CDCEventBuffer({logger: this.logger});
    this.cdcBufferReplayTimer = null;
    this.cdcBufferReplayInFlight = false;
    this.cdcBufferReplayDelayMs =
      PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS;
    // CDC pipeline metrics (shared across the node)
    this.cdcPipelineMetrics = options.cdcPipelineMetrics ||
      new CDCPipelineMetrics();
    // Optional CDC confirmation tracker for awaitable CDC delivery
    this.cdcConfirmationTracker = options.cdcConfirmationTracker || null;

    // CDC delivery helper (subscriber management, buffering, replay)
    this.cdcDelivery = new PartitionCDCDelivery(this);
    // Recently-applied write keys for idempotent Raft replay handling.
    this.recentlyAppliedEntryKeys = new Set();
    this.recentlyAppliedEntryOrder = [];
    this.migrationColumnDefaultsByTable = new Map();
    this.maxTrackedAppliedEntries =
      PARTITION_SERVICE_DEFAULT.MAX_TRACKED_APPLIED_ENTRIES;

    // HLC clock for ordering
    this.hlcClock = new HLCClockService(this.replicaId);

    // Transaction state
    this.activeTransactions = new Map();
    this.preparedTransactions = new Map();
    this.preparedStateLostSessions = new Set();
    this.committedWriteLog = [];
    this.rowCommitEpoch = new Map();
    this.maxCommittedWriteLogEntries = Number.isFinite(
      options.maxCommittedWriteLogEntries,
    ) && options.maxCommittedWriteLogEntries > NUM.ZERO ?
      Math.floor(options.maxCommittedWriteLogEntries) :
      PARTITION_SERVICE_DEFAULT.MAX_COMMITTED_WRITE_LOG_ENTRIES;
    this.preparedStateHoldTimeoutMs = Number.isFinite(
      options.preparedStateHoldTimeoutMs,
    ) && options.preparedStateHoldTimeoutMs > NUM.ZERO ?
      Math.floor(options.preparedStateHoldTimeoutMs) :
      TIMEOUT_BUDGET_DEFAULT.PREPARED_HOLD_TIMEOUT_MS;
    this.preparedStateHoldSweepIntervalMs = Number.isFinite(
      options.preparedStateHoldSweepIntervalMs,
    ) && options.preparedStateHoldSweepIntervalMs > NUM.ZERO ?
      Math.floor(options.preparedStateHoldSweepIntervalMs) :
      PARTITION_SERVICE_DEFAULT.PREPARED_STATE_HOLD_SWEEP_INTERVAL_MS;
    this.preparedStateHoldTimer = null;
    this.activeTransaction = null;
    this.transactionOperations = [];

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(PARTITION_SUBSYSTEM.PARTITION) : console;
    this.suppressLifecycleLogs = Boolean(options.suppressLifecycleLogs);
    this.onInitializationStage =
      typeof options.onInitializationStage === PARTITION_SERVICE_TYPE.FUNCTION ?
        options.onInitializationStage :
        null;

    // State
    this.initialized = false;
    this.isShutdown = false;
    this.isLeader = false;
    this.leaderActivationScheduler = options.leaderActivationScheduler ||
      LeaderActivationScheduler.getShared({
        nodeId: this.nodeId,
        spacingMs: this.leaderActivationNodeSpacingMs,
      });
    this.leaderActivationGate = new LeaderActivationGate({
      holdoffMs: this.leaderActivationStabilizationMs,
      activationScheduler: this.leaderActivationScheduler,
    });
    this.lastPreparedStateReconstructionTerm = null;

    // PendingRequestTracker for lifecycle messages (replaces EventEmitter-based ACK handling)
    // Requirements: 3.1, 6.1, 6.2, 6.3, 6.4
    this.pendingRequestTracker = new PendingRequestTracker({
      defaultTimeoutMs: PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS,
    });
    this.systemTableCacheChangeListener =
      this.handleSystemTableCacheChange.bind(this);
    this.peerReconciliationScheduled = false;

    // Rebalancer - manages replica placement when this partition is leader
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
    // Message group service for sending CREATE_REPLICA/REMOVE_REPLICA messages
    this.messageGroupService = options.messageGroupService || null;
    // MessageRouter for cross-node lifecycle messages (CREATE_REPLICA/REMOVE_REPLICA)
    // This transport properly routes through WebSocket to reach remote nodes
    this.messageRouter = options.messageRouter || null;

    // Defer election start until all replicas are ready
    // Learner phase support - new replicas joining existing groups start as learners
    // They receive log entries but don't vote until caught up
    // This prevents new replicas from disrupting existing leadership
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

    // When true, the Raft election timer won't start until startElection() is called
    // This prevents election storms when multiple replicas are created on the same node
    // CRITICAL: Learners must defer elections to prevent disrupting existing leadership
    this.deferElection = options.deferElection || this.isJoiningExistingGroup;
    this.electionStarted = false;
    this.raftTimingConfig = null;
    // ReplicaStateMachine for tracking replica lifecycle states
    this.replicaStateMachine = options.replicaStateMachine || null;

    // Map of replicaId -> unified address (e.g., 'nodeId/partition/replicaId')
    // Used when joining an existing partition on a different node
    // Requirements: 1.1, 3.1, 3.2, 3.3
    this.peerAddresses = options.peerAddresses || [];
    this.learnerPromotionDelayMs = options.learnerPromotionDelayMs ||
      PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_DELAY_MS;
    this.learnerCatchUpCheckIntervalMs = options.learnerCatchUpCheckIntervalMs ||
      PARTITION_SERVICE_DEFAULT.LEARNER_CATCH_UP_CHECK_INTERVAL_MS;
    this.learnerPromotionTimer = null;
    // Transient split execution handle — NOT canonical workflow state.
    // The durable split phase is owned by ManagedSplitWorkflow via
    // DurableWorkflowCoordinator. This object caches active execution
    // context (phase, pending write entries, flush guard) for the
    // duration of one runSplitReplicationWorkflow() invocation.
    // On process restart, the workflow owner reconstructs canonical
    // state from durable rows; this handle is rebuilt from that state
    // via reconstructSplitExecutionState().
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
    if (previousCache &&
        previousCache !== systemTableCache &&
        typeof previousCache.offCacheChange === PARTITION_SERVICE_TYPE.FUNCTION &&
        this.systemTableCacheChangeListener) {
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
    if (systemTableCache &&
        systemTableCache !== previousCache &&
        typeof systemTableCache.onCacheChange === PARTITION_SERVICE_TYPE.FUNCTION &&
        this.systemTableCacheChangeListener) {
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
    this.leaderNodeMutationHelper?.setCdcIntegrationService(cdcIntegrationService);
    if (this.rebalancer) {
      this.rebalancer.cdcIntegrationService = cdcIntegrationService;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.cdcIntegrationService = cdcIntegrationService;
    }
  }

  get pendingRoleUpdate() {
    return this.roleMutationHelper?.pendingValue || null;
  }

  set pendingRoleUpdate(role) {
    if (this.roleMutationHelper) {
      this.roleMutationHelper.pendingValue =
        normalizePublishedRaftRole(role, {collapseLeaderToFollower: true});
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
    if (typeof this.releaseMetadataPublicationReadinessListener ===
      PARTITION_SERVICE_TYPE.FUNCTION) {
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
    return isMetadataPublicationLifecycleReady(this.metadataPublicationReadinessState);
  }

  isBackgroundWorkReady() {
    return isBackgroundWorkLifecycleReady(
      this.metadataPublicationReadinessState,
    );
  }

  handleMetadataPublicationReadinessTransition() {
    this.maybeInitializeRebalancer();
    if (!this.isMetadataPublicationReady()) {
      return;
    }
    this.flushRoleUpdate().catch((error) => {
      this.logger.warn(
        'Failed to flush deferred partition raft-role update',
        {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          error: error.message,
        },
      );
    });
    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn(
        'Failed to flush deferred partition leader update',
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
    this.leaderActivationGate.schedule(term, () => {
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
    }, {
      immediate: this.replicaIds.length === NUM.ONE,
      shouldActivate: () => !this.isShutdown && this.isLeader,
    });
  }

  createRoleMutationHelper() {
    return new AuthoritativeRowMutationHelper({
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      buildWhereClause: (_role, context = {}) => {
        const whereClause = {service_id: this.replicaId};
        const cachedRow = context.cachedRow;
        if (typeof cachedRow?.raft_role === 'string' && cachedRow.raft_role.length > 0) {
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
        deliveryPriority: 'background',
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDefer: true,
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      }),
      buildExpectedCacheFields: (role) => ({
        raft_role: role,
      }),
      prepareFlush: () => ({
        skip: !this.isMetadataPublicationReady(),
        clearPending: false,
        reason: !this.isMetadataPublicationReady() ?
          FLUSH_SKIP_SETTLING :
          'ready',
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
        if (typeof cachedRow?.[COLUMN.LEADER_NODE_ID] === 'string' &&
            cachedRow[COLUMN.LEADER_NODE_ID].length > 0) {
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
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      }),
      buildExpectedCacheFields: (leaderNodeId) => ({
        [COLUMN.LEADER_NODE_ID]: leaderNodeId,
      }),
      readRowFromCache: (systemTableCache) =>
        systemTableCache?.get?.(TABLES.PARTITIONS, this.partitionId) || null,
      readValueFromCache: (systemTableCache) => {
        const cached = systemTableCache?.get?.(TABLES.PARTITIONS, this.partitionId);
        return cached?.[COLUMN.LEADER_NODE_ID] || null;
      },
      prepareFlush: () => ({
        skip: !this.isLeader,
        clearPending: !this.isLeader,
        reason: !this.isLeader ? 'not-owner' : 'ready',
      }),
      isWriteReady: () => this.isPartitionsLeaderAvailable(),
      systemTableCache: this.systemTableCache,
      cdcIntegrationService: this.cdcIntegrationService,
      onAsyncError: (error, context = {}) => {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_PARTITION_LEADER_FAILED, {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          leaderNodeId: context.value ?? this.pendingLeaderNodeUpdate,
          error: error.message,
        });
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

    // If peerId is already in unified format, validate and return as-is.
    // Fail fast (and log) when a provided address is not unified.
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

    // Check peerAddresses array (provided during cross-node joining)
    // Format: ['nodeId/partition/replicaId', ...]
    // Requirements: 1.1, 1.4, 3.1, 3.2, 3.3
    if (this.peerAddresses && this.peerAddresses.length > NUM.ZERO) {
      for (const addr of this.peerAddresses) {
        const validation = addressManager.validate(addr);
        if (!validation.valid) {
          this.logger.error(PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_NOT_UNIFIED, {
            peerId: addr,
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: validation.error,
          });
          throw new Error(`Peer address must be unified: ${addr}`);
        }
        if (
          addr.endsWith(
            `${PARTITION_SERVICE_ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` +
            `${PARTITION_SERVICE_ADDRESS.SEPARATOR}${peerId}`,
          ) ||
          addr.endsWith(`${PARTITION_SERVICE_ADDRESS.SEPARATOR}${peerId}`)
        ) {
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
    if (typeof candidate !== 'string' || candidate.length === NUM.ZERO) {
      return null;
    }
    if (!candidate.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR)) {
      return candidate;
    }
    try {
      const parsed = AddressManager.getInstance().parse(candidate);
      if (parsed?.serviceType === ENTITY_TYPE.PARTITION &&
          typeof parsed?.serviceId === 'string' &&
          parsed.serviceId.length > NUM.ZERO) {
        return parsed.serviceId;
      }
    } catch (_error) {
      // Ignore malformed addresses and preserve the original value.
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
    if (!this.systemTableCache ||
        typeof this.systemTableCache.get !== PARTITION_SERVICE_TYPE.FUNCTION) {
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

    if (record.partition_id !== this.partitionId ||
        record.service_type !== SERVICE_TYPE.PARTITION) {
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

  /**
   * Join newly visible peers and replace moved peer addresses using the
   * authoritative services cache. Missing rows are ignored conservatively.
   * @private
   */
  reconcileRaftPeersFromCache() {
    if (!this.raft ||
        !this.systemTableCache ||
        typeof this.systemTableCache.filter !== PARTITION_SERVICE_TYPE.FUNCTION) {
      return;
    }

    const services = this.systemTableCache.filter(TABLES.SERVICES, (service) => {
      return service.partition_id === this.partitionId &&
        service.service_type === SERVICE_TYPE.PARTITION;
    });
    if (services.length === NUM.ZERO) {
      return;
    }

    const addressManager = AddressManager.getInstance();
    const expectedAddressesByReplicaId = new Map();
    for (const service of services) {
      const replicaId = service.service_id || service.replica_id;
      if (!replicaId || replicaId === this.replicaId) {
        continue;
      }

      const status = service.status || ReplicaStatus.ACTIVE;
      if (status === ReplicaStatus.FAILED ||
          status === ReplicaStatus.REMOVING ||
          status === ReplicaStatus.REMOVED) {
        continue;
      }

      const peerAddress =
        typeof service.address === 'string' &&
          service.address.length > NUM.ZERO ?
          service.address :
          (
            typeof service.node_id === 'string' &&
            service.node_id.length > NUM.ZERO ?
              addressManager.format(
                service.node_id,
                ENTITY_TYPE.PARTITION,
                replicaId,
              ) :
              null
          );
      if (!peerAddress) {
        continue;
      }

      expectedAddressesByReplicaId.set(replicaId, peerAddress);
      if (!this.replicaIds.includes(replicaId)) {
        this.replicaIds.push(replicaId);
      }
    }

    const currentNodes = Array.isArray(this.raft.nodes) ?
      [...this.raft.nodes] :
      [];
    const currentAddresses = new Set(
      currentNodes
        .map((node) => node?.address)
        .filter((address) =>
          typeof address === 'string' && address.length > NUM.ZERO,
        ),
    );

    for (const [replicaId, expectedAddress] of expectedAddressesByReplicaId.entries()) {
      const staleAddresses = currentNodes
        .map((node) => node?.address)
        .filter((address) => {
          if (typeof address !== 'string' ||
              address.length === NUM.ZERO ||
              address === expectedAddress) {
            return false;
          }
          try {
            const parsed = addressManager.parse(address);
            return parsed.serviceType === ENTITY_TYPE.PARTITION &&
              parsed.serviceId === replicaId;
          } catch (_error) {
            return false;
          }
        });

      if (typeof this.raft.leave === PARTITION_SERVICE_TYPE.FUNCTION) {
        for (const staleAddress of staleAddresses) {
          this.raft.leave(staleAddress);
          currentAddresses.delete(staleAddress);
        }
      }

      if (!currentAddresses.has(expectedAddress)) {
        this.raftProvider.joinPeer(this.raft, expectedAddress);
        currentAddresses.add(expectedAddress);
      }
    }
  }

  /**
   * Read one system table row from the local cache when present.
   * @param {string} tableName
   * @param {Function} predicate
   * @return {Object|null}
   * @private
   */
  getCachedSystemTableRow(tableName, predicate) {
    if (!this.systemTableCache || typeof predicate !== 'function') {
      return null;
    }

    if (typeof this.systemTableCache.filter === 'function') {
      const rows = this.systemTableCache.filter(tableName, predicate);
      return rows[NUM.ZERO] || null;
    }

    if (typeof this.systemTableCache.getAll === 'function') {
      const rows = this.systemTableCache.getAll(tableName) || [];
      return rows.find(predicate) || null;
    }

    return null;
  }

  /**
   * Read matching system table rows from the local cache when present.
   * @param {string} tableName
   * @param {Function} predicate
   * @return {Array<Object>}
   * @private
   */
  getCachedSystemTableRows(tableName, predicate) {
    if (!this.systemTableCache || typeof predicate !== 'function') {
      return [];
    }

    if (typeof this.systemTableCache.filter === 'function') {
      return this.systemTableCache.filter(tableName, predicate);
    }

    if (typeof this.systemTableCache.getAll === 'function') {
      const rows = this.systemTableCache.getAll(tableName) || [];
      return rows.filter(predicate);
    }

    return [];
  }

  /**
   * Resolve the current leader replica from canonical owner-row metadata.
   * Owner rows outrank derived services roles; if leader_node_id is present,
   * prefer the replica on that node before falling back to services.raft_role.
   * @return {string|null}
   * @private
   */
  resolveLeaderIdFromMetadata() {
    const serviceRows = this.getCachedSystemTableRows(TABLES.SERVICES, (service) =>
      service?.[COLUMN.PARTITION_ID] === this.partitionId &&
      service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service?.[COLUMN.STATUS] !== ReplicaStatus.FAILED &&
      service?.[COLUMN.STATUS] !== ReplicaStatus.REMOVED,
    );
    if (serviceRows.length === NUM.ZERO) {
      return null;
    }

    const partitionRow = this.getCachedSystemTableRow(TABLES.PARTITIONS, (partition) =>
      partition?.[COLUMN.PARTITION_ID] === this.partitionId,
    );
    const leaderNodeId = partitionRow?.[COLUMN.LEADER_NODE_ID] || null;
    if (typeof leaderNodeId === 'string' && leaderNodeId.length > NUM.ZERO) {
      const leaderReplica = serviceRows.find((service) =>
        service?.[COLUMN.NODE_ID] === leaderNodeId,
      );
      const leaderReplicaId = leaderReplica?.[COLUMN.REPLICA_ID] ||
        leaderReplica?.[COLUMN.SERVICE_ID] ||
        null;
      if (typeof leaderReplicaId === 'string' && leaderReplicaId.length > NUM.ZERO) {
        return leaderReplicaId;
      }
    }

    const leaderService = serviceRows.find((service) =>
      String(service?.[COLUMN.RAFT_ROLE] || '').toLowerCase() ===
        PARTITION_RAFT_ROLE.LEADER,
    );
    const leaderServiceId = leaderService?.[COLUMN.REPLICA_ID] ||
      leaderService?.[COLUMN.SERVICE_ID] ||
      null;
    return typeof leaderServiceId === 'string' && leaderServiceId.length > NUM.ZERO ?
      leaderServiceId :
      null;
  }

  /**
   * Seed leader identity from the startup leader-address hint when joining
   * an already-established group. Stable joins may not observe a fresh Raft
   * leader-change event before learner promotion needs to run.
   * @return {string|null}
   * @private
   */
  resolveLeaderIdFromHint() {
    if (!this.leaderAddressHint) {
      return null;
    }

    try {
      const parsed = AddressManager.getInstance().parse(this.leaderAddressHint);
      return parsed.serviceType === ENTITY_TYPE.PARTITION ?
        parsed.serviceId :
        null;
    } catch (_parseErr) {
      return null;
    }
  }

  /**
   * Report partition initialization progress stage.
   * @param {string} stage - Initialization stage.
   * @param {Object} details - Additional stage details.
   * @private
   */
  reportInitializationStage(stage, details = {}) {
    if (!this.onInitializationStage) {
      return;
    }
    try {
      this.onInitializationStage({
        stage,
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        ...details,
      });
    } catch (error) {
      this.logger.warn(PARTITION_SERVICE_LOG_MSG.INIT_STAGE_CALLBACK_FAILED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        stage,
        error: error.message,
      });
    }
  }

  /**
   * Initialize the partition service.
   * Uses liferaft library for Raft consensus with simplified transport.
   * Requirements: 8.1, 10.1, 10.2, 10.3, 10.4, 10.5
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.STARTING, {
      partitionId: this.partitionId,
      tableId: this.tableId,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      replicaCount: this.replicaIds.length,
      dbPath: this.dbPath,
    });
    if (!this.suppressLifecycleLogs) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.INITIALIZING, {
        partitionId: this.partitionId,
        tableId: this.tableId,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        replicaCount: this.replicaIds.length,
        dbPath: this.dbPath,
      });
    }

    // Ensure directory exists for file-based databases
    if (this.dbPath !== PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH) {
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, {recursive: true});
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.CREATED_PARTITION_DIR, {path: dbDir});
      }
    }

    this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.OPENING_DB, {
      dbPath: this.dbPath,
    });

    // Open SQLite database
    this.db = new Database(this.dbPath);
    this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_JOURNAL_MODE);
    this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_SYNCHRONOUS);

    // Initialize Raft storage
    this.storage = new PartitionRaftStorage(this.db, this.partitionId);

    // Create table if schema provided
    if (this.schema) {
      this.createTable();
    }

    // Register with transport if available using unified address format
    // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
    if (this.transport) {
      this.transport.register(this.unifiedAddress, this.handleTransportMessage.bind(this));
    }

    // Start as follower
    this.role = RaftRole.FOLLOWER;

    // Get Raft configuration from ConfigurationManager
    // Requirements: 10.1
    const config = ConfigurationManager.getInstance();
    const heartbeatMs = config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) ||
      PARTITION_SERVICE_VALUE.LIFERAFT_HEARTBEAT_DEFAULT_MS;
    const baseElectionMinMs = config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) ||
      PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MIN_DEFAULT_MS;
    const baseElectionMaxMs = config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) ||
      PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MAX_DEFAULT_MS;
    const tickIntervalMs = config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS);
    const {electionMinMs, electionMaxMs} = computeReplicaElectionTimeouts({
      replicaId: this.replicaId,
      replicaIds: this.replicaIds,
      baseElectionMinMs,
      baseElectionMaxMs,
      electionJitterPerReplicaMs:
        PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS,
    });
    this.raftTimingConfig = {
      heartbeatMs,
      baseElectionMinMs,
      baseElectionMaxMs,
      electionMinMs,
      electionMaxMs,
      tickIntervalMs: Number.isFinite(tickIntervalMs) ? tickIntervalMs : null,
    };

    // Create extended LifeRaft class with our transport using ES6 class inheritance
    // Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
    const self = this;
    const deferElection = this.deferElection;

    /**
     * Custom Raft node class that extends LifeRaft with our transport.
     * Simplified to call transport.deliver() directly without type conversion.
     * Supports deferred election start to prevent election storms during bootstrap.
     * Requirements: 10.1, 10.2, 10.3, 10.4
     */
    class RaftNode extends LifeRaft {
      /**
       * Override initialize to support deferred election start.
       * When deferElection is true, we don't start the heartbeat timer.
       * Call startElection() later to begin the election process.
       * @param {Object} options - Initialization options.
       * @param {Function} callback - Completion callback.
       */
      initialize(options, callback) {
        if (deferElection) {
          // Don't start heartbeat timer - election will be started manually
          self.logger.debug(PARTITION_SERVICE_LOG_MSG.DEFERRING_ELECTION_START, {
            replicaId: self.replicaId,
            partitionId: self.partitionId,
          });
          // Just signal initialization complete without starting timer
          if (callback) callback();
        } else {
          // Normal initialization - heartbeat timer will start automatically
          if (callback) callback();
        }
      }

      /**
       * Write method for sending Raft messages to peers.
       * Called by liferaft when it needs to communicate with other nodes.
       * Sends packets directly to transport without type conversion.
       * Note: When liferaft calls node.write(), 'this' is the cloned node
       * representing the peer, so 'this.address' is the destination address.
       * Requirements: 10.2, 10.3, 10.4
       * @param {Object} packet - Raft protocol packet (packet.address is sender)
       * @param {Function} callback - Completion callback
       */
      write(packet, callback) {
        // Build peer address for routing
        // this.address is the destination, packet.address is the sender
        const peerAddress = self.buildPeerAddress(this.address);

        // Send packet unchanged - no type conversion
        // Only add destination address for routing, preserve all packet fields
        // Requirements: 10.2, 10.3
        self.transport.deliver(peerAddress, packet)
          .then((result) => callback(null, result))
          .catch((err) => callback(err));
      }
    }

    // Create SQLiteLogAdapter for liferaft
    // Requirements: 12.1, 12.2, 12.3, 12.4
    this.logAdapter = new SQLiteLogAdapter(this.db);

    // Create liferaft instance
    // Use unified address so that packet.address contains the full address
    // This allows other nodes to respond to vote requests correctly
    // Requirements: 8.1, 10.1, 10.5
    const logAdapter = this.logAdapter;
    this.raft = new RaftNode(this.unifiedAddress, {
      [PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT]: heartbeatMs,
      [PARTITION_SERVICE_LIFERAFT_TIMER.ELECTION_MIN]: electionMinMs,
      [PARTITION_SERVICE_LIFERAFT_TIMER.ELECTION_MAX]: electionMaxMs,
      [PARTITION_SERVICE_LIFERAFT_TIMER.LOG]: function() {
        return logAdapter;
      },
    });

    // If deferElection is true, clear all timers that liferaft started automatically
    // This prevents elections from starting until startElection() is called
    // Liferaft's _initialize() sets up a 'state change' handler that starts timers
    if (this.deferElection && this.raft) {
      this.raftProvider.clearTimers(
        this.raft,
        PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT_ELECTION,
      );
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.CLEARED_LIFERAFT_TIMERS, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
      });
    }

    // Track if this is a truly single-replica group for special handling
    // Only consider it single-replica if replicaIds.length === 1
    // Do NOT use replicaIds.every() check as that could cause premature leadership
    // when peer list is incomplete (violates Requirements 4.3, 5.1, 5.2, 5.3)
    const isSingleReplica = () => {
      const peerCount = Array.isArray(this.raft?.nodes) ?
        this.raft.nodes.length :
        NUM.ZERO;
      return this.replicaIds.length === NUM.ONE && peerCount === NUM.ZERO;
    };
    const shouldIgnoreDemotionEvent = (eventName) => {
      if (isSingleReplica() && this.isLeader) {
        return true;
      }
      const isJoiningLearner =
        this.isJoiningExistingGroup === true &&
        this.role === RaftRole.LEARNER;
      if (!isJoiningLearner) {
        return false;
      }
      if (eventName !== PARTITION_SERVICE_ROLE.FOLLOWER &&
          eventName !== PARTITION_SERVICE_ROLE.CANDIDATE) {
        return false;
      }
      if (this.raft) {
        this.raftProvider.clearTimers(
          this.raft,
          PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT_ELECTION,
        );
      }
      return true;
    };

    // Learner phase: new replicas joining existing groups start as non-voting learners
    // They receive log entries but don't vote until caught up
    // This prevents new replicas from disrupting existing leadership
    if (this.isJoiningExistingGroup) {
      this.role = RaftRole.LEARNER;
      this.logger.info(PARTITION_SERVICE_LOG_MSG.STARTING_AS_LEARNER, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        promotionDelayMs: this.learnerPromotionDelayMs,
      });
      // Schedule promotion check after minimum delay
      this.scheduleLearnerPromotion();
    }

    wireReplicaLifecycleEvents(this, {
      events: {
        LEADER: PARTITION_SERVICE_ROLE.LEADER,
        FOLLOWER: PARTITION_SERVICE_ROLE.FOLLOWER,
        CANDIDATE: PARTITION_SERVICE_ROLE.CANDIDATE,
        COMMIT: PARTITION_SERVICE_REASON.COMMIT,
        LEADER_CHANGE: PARTITION_SERVICE_REASON.LEADER_CHANGE,
        TERM_CHANGE: PARTITION_SERVICE_REASON.TERM_CHANGE,
      },
      roles: RaftRole,
      getCurrentTerm: () => this.raftProvider.getCurrentTerm(this.raft),
      normalizeLeaderId: (candidate) =>
        this.normalizeLeaderReplicaId(candidate),
      shouldIgnoreDemotionEvent,
      onLeader: ({term}) => {
        this.storage.currentTerm = term;
        this.scheduleLeaderOwnedActivation(term);
      },
      onFollower: ({term}) => {
        this.storage.currentTerm = term;
        this.cancelLeaderOwnedActivation();
        this.updateRebalancerLeadership();
      },
      onCandidate: ({term}) => {
        this.storage.currentTerm = term;
        this.cancelLeaderOwnedActivation();
        this.updateRebalancerLeadership();
      },
      onCommit: (command) => {
        this.applyCommittedEntry(command);
      },
      onLeaderChange: ({leaderId}) => {
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEADER_CHANGED, {
          newLeader: leaderId,
          partitionId: this.partitionId,
        });
      },
      onTermChange: ({term}) => {
        this.storage.currentTerm = term;
      },
    });

    // Join peer nodes
    // Requirements: 3.1, 3.2, 3.3 - All peer addresses use fully qualified format
    const totalPeerCount = Math.max(NUM.ZERO, this.replicaIds.length - NUM.ONE);
    let joinedPeerCount = NUM.ZERO;
    this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.JOINING_PEERS, {
      peerTotal: totalPeerCount,
      peerJoined: joinedPeerCount,
    });
    for (const peerId of this.replicaIds) {
      if (peerId !== this.replicaId) {
        const peerAddress = this.buildPeerAddress(peerId);
        if (!this.suppressLifecycleLogs) {
          this.logger.info(PARTITION_SERVICE_LOG_MSG.JOINING_PEER_ADDRESS, {
            peerId,
            peerAddress,
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            addressFormat: peerAddress.includes(PARTITION_SERVICE_ADDRESS.SEPARATOR) ?
              PARTITION_SERVICE_ADDRESS.FORMAT_UNIFIED :
              PARTITION_SERVICE_ADDRESS.FORMAT_SIMPLE,
          });
        }
        this.raftProvider.joinPeer(this.raft, peerAddress);
        joinedPeerCount += NUM.ONE;
        this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.JOINED_PEER, {
          peerId,
          peerAddress,
          peerTotal: totalPeerCount,
          peerJoined: joinedPeerCount,
        });
      }
    }
    this.reconcileRaftPeersFromCache();

    this.maybeInitializeRebalancer();

    // For truly single-replica groups, become leader immediately
    // This avoids the election timer delay during bootstrap
    // Only do this when replicaIds.length === 1 (truly single replica)
    // Do NOT use replicaIds.every() check - that could cause premature leadership
    // when peer list is incomplete (violates Requirements 4.3, 5.1, 5.2, 5.3)
    // Let liferaft handle all multi-replica elections
    // Requirements: 10.5
    if (this.replicaIds.length === NUM.ONE) {
      if (this.raft &&
          typeof this.raft.change === PARTITION_SERVICE_TYPE.FUNCTION) {
        this.raft.change({
          state: LifeRaft.LEADER,
        });
        this.raft.leader = this.unifiedAddress;
      } else {
        // Best-effort fallback when the embedded raft implementation is absent.
        this.role = RaftRole.LEADER;
        this.isLeader = true;
        this.leaderId = this.replicaId;
        this.queueRoleUpdate(this.role);
        this.queueLeaderNodeUpdate(this.nodeId);
        this.updateRebalancerLeadership();
        this.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED, {
          leaderId: this.replicaId,
          term: this.raftProvider.getCurrentTerm(this.raft),
          partitionId: this.partitionId,
        });
      }

      this.logger.info(PARTITION_SERVICE_LOG_MSG.SINGLE_REPLICA_LEADER, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
      });
    } else {
      // Followers and learners may never emit a role-change event during
      // steady-state startup, so publish the startup role explicitly.
      this.queueRoleUpdate(this.role);
    }

    // Start periodic size updates
    this.startPeriodicSizeUpdates();
    this.startPreparedStateHoldTimeoutSweep();

    // Calculate initial size
    await this.updatePartitionSize();

    this.initialized = true;

    this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.READY, {
      sizeBytes: this.sizeBytes,
      peerTotal: totalPeerCount,
      peerJoined: joinedPeerCount,
    });
    if (!this.suppressLifecycleLogs) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.INITIALIZED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        sizeBytes: this.sizeBytes,
      });
    }

    this.emit(PARTITION_SERVICE_EVENT.INITIALIZED, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }

  /**
   * Start the Raft election timer.
   * Call this after all replicas in the group have been created and registered.
   * This prevents election storms when multiple replicas are created on the same node.
   * If deferElection was false, this is a no-op (election already started).
   */
  startElection() {
    if (this.electionStarted) {
      return;
    }

    // For single-replica groups, we're already leader
    if (this.replicaIds.length === NUM.ONE) {
      this.electionStarted = true;
      return;
    }

    this.electionStarted = true;

    if (this.raft) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.STARTING_ELECTION_TIMER, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        peerCount: this.replicaIds.length - NUM.ONE,
      });

      this.raftProvider.startElectionTimer(this.raft);
    }
  }

  /**
   * Apply raft timing configuration to this live replica.
   * @param {Object} timingConfig
   * @param {number} timingConfig.heartbeatIntervalMs
   * @param {number} timingConfig.electionTimeoutMinMs
   * @param {number} timingConfig.electionTimeoutMaxMs
   * @param {number} [timingConfig.tickIntervalMs]
   * @return {boolean} True when applied to an initialized raft instance.
   */
  applyRaftTimingConfig(timingConfig = {}) {
    const heartbeatMs = timingConfig.heartbeatIntervalMs;
    const baseElectionMinMs = timingConfig.electionTimeoutMinMs;
    const baseElectionMaxMs = timingConfig.electionTimeoutMaxMs;
    const previousTickIntervalMs =
      this.raftTimingConfig?.tickIntervalMs || null;
    const hasTickInterval = Object.prototype.hasOwnProperty.call(
      timingConfig,
      'tickIntervalMs',
    );
    const tickIntervalMs = timingConfig.tickIntervalMs;
    if (!Number.isFinite(heartbeatMs) ||
      !Number.isFinite(baseElectionMinMs) ||
      !Number.isFinite(baseElectionMaxMs) ||
      (hasTickInterval && (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= 0)) ||
      baseElectionMinMs > baseElectionMaxMs) {
      return false;
    }

    const {electionMinMs, electionMaxMs, jitterMs} =
      computeReplicaElectionTimeouts({
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionJitterPerReplicaMs:
          PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS,
      });
    this.raftTimingConfig = {
      heartbeatMs,
      baseElectionMinMs,
      baseElectionMaxMs,
      electionMinMs,
      electionMaxMs,
      tickIntervalMs: hasTickInterval ?
        tickIntervalMs :
        this.raftTimingConfig?.tickIntervalMs || null,
    };

    const shouldRearmTimer = this.replicaIds.length > NUM.ONE &&
      (!this.deferElection || this.electionStarted);
    const applied = applyRuntimeRaftTiming({
      raft: this.raft,
      heartbeatMs,
      electionMinMs,
      electionMaxMs,
      rearmTimer: shouldRearmTimer,
    });
    if (!applied) {
      return false;
    }

    const tickChanged = hasTickInterval &&
      tickIntervalMs !== previousTickIntervalMs;
    const tickRuntimeApplied = !tickChanged ||
      this.applyRuntimeTickInterval(tickIntervalMs);

    this.logger.info(PARTITION_SERVICE_LOG_MSG.APPLIED_RUNTIME_RAFT_TIMING, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      heartbeatMs,
      electionMinMs,
      electionMaxMs,
      tickIntervalMs: hasTickInterval ? tickIntervalMs : null,
      tickRuntimeApplied,
      jitterMs,
      rearmTimer: shouldRearmTimer,
    });
    return tickRuntimeApplied;
  }

  /**
   * Apply raft provider tick interval when supported by the active provider.
   * @param {number} tickIntervalMs
   * @return {boolean} True when applied to a live raft instance.
   */
  applyRuntimeTickInterval(tickIntervalMs) {
    if (!this.raft ||
      !Number.isFinite(tickIntervalMs) ||
      tickIntervalMs <= 0) {
      return false;
    }

    if (typeof this.raft.setTickInterval === PARTITION_SERVICE_TYPE.FUNCTION) {
      this.raft.setTickInterval(tickIntervalMs);
      return true;
    }

    if (typeof this.raft.configureTickInterval === PARTITION_SERVICE_TYPE.FUNCTION) {
      this.raft.configureTickInterval(tickIntervalMs);
      return true;
    }

    if (Object.prototype.hasOwnProperty.call(this.raft, 'tickIntervalMs')) {
      this.raft.tickIntervalMs = tickIntervalMs;
      return true;
    }

    return false;
  }

  /**
   * Create the table based on schema.
   * @private
   */
  createTable() {
    if (!this.schema || !this.schema.columns) {
      return;
    }

    const columns = this.schema.columns.map((col) => {
      let def = `${col.name} ${col.type}`;
      if (col.primaryKey) {
        def += PARTITION_SERVICE_SQL_FRAGMENT.PRIMARY_KEY;
      }
      if (col.notNull) {
        def += PARTITION_SERVICE_SQL_FRAGMENT.NOT_NULL;
      }
      if (col.defaultValue !== undefined) {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      return def;
    }).join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);

    const sql = `CREATE TABLE IF NOT EXISTS ${this.tableName} (${columns})`;
    this.db.exec(sql);

    this.ensureNodesTableColumns();
    this.ensureTablesTableColumns();
    this.ensureMessageGroupsTableColumns();
    this.ensurePartitionsTableColumns();

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CREATED_TABLE, {
      tableName: this.tableName,
      partitionId: this.partitionId,
    });
  }

  /**
   * Ensure nodes table includes connection_state column for readiness tracking.
   * @private
   */
  ensureNodesTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.NODES) {
      return;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${this.tableName})`).all();
    const hasConnectionState = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.CONNECTION_STATE,
    );
    const hasLegacyWsConnectionState = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.LEGACY_WS_CONNECTION_STATE,
    );
    const hasCapabilities = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.CAPABILITIES,
    );
    const hasReadyLease = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.READY_LEASE_EXPIRES_AT,
    );

    let connectionStateAdded = false;
    if (!hasConnectionState) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_CONNECTION_STATE,
      );
      connectionStateAdded = true;

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_CONNECTION_STATE, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }

    if (connectionStateAdded && hasLegacyWsConnectionState) {
      this.db.exec(
        `UPDATE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.BACKFILL_CONNECTION_STATE_FROM_LEGACY_WS,
      );

      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.MIGRATED_CONNECTION_STATE_FROM_LEGACY_WS,
        {
          tableName: this.tableName,
          partitionId: this.partitionId,
        },
      );
    }

    if (!hasCapabilities) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_CAPABILITIES,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_CAPABILITIES, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }

    if (!hasReadyLease) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_READY_LEASE_EXPIRES_AT,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_READY_LEASE, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }

  /**
   * Ensure message_groups table includes leader_node_id column.
   * @private
   */
  ensureMessageGroupsTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.MESSAGE_GROUPS) {
      return;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${this.tableName})`).all();
    const hasLeaderNode = columns.some(
      (col) => col.name === COLUMN.LEADER_NODE_ID,
    );

    if (!hasLeaderNode) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_LEADER_NODE_ID,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_MESSAGE_GROUP_LEADER, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }

  /**
   * Ensure tables table includes partition lifecycle columns.
   * @private
   */
  ensureTablesTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.TABLES) {
      return;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${this.tableName})`).all();
    const hasActivePartitionVersion = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.ACTIVE_PARTITION_VERSION,
    );
    const hasPendingPartitionVersion = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.PENDING_PARTITION_VERSION,
    );
    const hasPartitionTransitionState = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_STATE,
    );
    const hasPartitionTransitionMetadata = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.PARTITION_TRANSITION_METADATA,
    );

    if (!hasActivePartitionVersion) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_ACTIVE_PARTITION_VERSION,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_ACTIVE_PARTITION_VERSION, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }

    if (!hasPendingPartitionVersion) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_PENDING_PARTITION_VERSION,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PENDING_PARTITION_VERSION, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }

    if (!hasPartitionTransitionState) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_STATE,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_STATE, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }

    if (!hasPartitionTransitionMetadata) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_TRANSITION_METADATA,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_TRANSITION_METADATA, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }

  /**
   * Ensure partitions table includes table_name column for compatibility.
   * @private
   */
  ensurePartitionsTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.PARTITIONS) {
      return;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${this.tableName})`).all();
    const hasTableName = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.TABLE_NAME,
    );
    const hasPartitionVersion = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.PARTITION_VERSION,
    );

    if (!hasTableName) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_TABLE_NAME,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITIONS_TABLE_NAME, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }

    if (!hasPartitionVersion) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
        PARTITION_SERVICE_COLUMN_SQL.ADD_PARTITION_VERSION,
      );

      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_PARTITION_VERSION, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }

  /**
   * Handle incoming transport message.
   * Detects Raft packets using isRaftPacket() and routes them directly to liferaft.
   * Handles non-Raft messages as application messages.
   * Requirements: 8.3, 8.4, 13.1, 13.2, 13.3, 13.4
   * @param {Object} envelope - Message envelope.
   * @return {Promise<Object>} Response.
   * @private
   */
  async handleTransportMessage(envelope) {
    // Extract payload - handle both envelope and direct packet formats
    const payload = envelope.payload || envelope;

    // Detect and handle Raft packets directly using isRaftPacket()
    // No type conversion needed - packets flow through unchanged
    // Requirements: 8.3, 8.4, 13.1, 13.2
    if (isRaftPacket(payload)) {
      if (this.raft) {
        this.logger.trace(PARTITION_SERVICE_LOG_MSG.RECEIVED_RAFT_PACKET, {
          type: payload.type,
          term: payload.term,
          address: payload.address,
          replicaId: this.replicaId,
          partitionId: this.partitionId,
        });

        // Create write function for sending responses back to the sender
        // The sender's address is in payload.address
        // Requirements: 8.4
        const senderAddress = payload.address;
        const write = (responsePacket) => {
          if (responsePacket) {
            this.logger.trace(PARTITION_SERVICE_LOG_MSG.SENDING_RAFT_RESPONSE, {
              type: responsePacket.type,
              destination: senderAddress,
              term: responsePacket.term,
            });
            // Send response to the sender
            this.transport.deliver(senderAddress, responsePacket)
              .catch((err) => {
                this.logger.error(PARTITION_SERVICE_LOG_MSG.FAILED_RAFT_RESPONSE, {
                  error: err.message,
                  destination: senderAddress,
                });
              });
          }
        };

        // Emit to liferaft with write function for responses
        // Requirements: 8.4
        this.raft.emit(PARTITION_SERVICE_EVENT.DATA, payload, write);
      }
      return {acknowledged: true};
    }

    // Handle application messages (non-Raft)
    // Requirements: 13.3
    return this.handleApplicationMessage(envelope);
  }

  /**
   * Handle application messages (non-Raft messages).
   * Raft packets are handled by handleTransportMessage() using isRaftPacket().
   * This method only handles application-level messages like FORWARD_WRITE.
   * Requirements: 13.3, 13.4
   * @param {Object} message - Application message
   * @return {Promise<Object>} Processing result
   */
  async handleApplicationMessage(message) {
    const payload = this.extractApplicationPayload(message);

    if (!payload || !payload.type) {
      return {acknowledged: false, error: PARTITION_SERVICE_ERROR_MSG.INVALID_MESSAGE};
    }

    // Handle application messages only - Raft packets are handled by
    // handleTransportMessage() using isRaftPacket() and emitted to liferaft
    // Requirements: 13.3, 13.4
    switch (payload.type) {
    case PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE:
      // Handle forwarded write operations from followers
      if (payload.operation) {
        return this.applyWrite(payload.operation);
      }
      return {acknowledged: false, error: PARTITION_SERVICE_ERROR_MSG.INVALID_FORWARD_WRITE};
    case PARTITION_SERVICE_MESSAGE_TYPE.SYSTEM_TABLE_WRITE:
      // Handle system table writes from joining nodes
      // Routes CDC updates from nodes that don't have local system partitions
      return this.handleSystemTableWrite(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.QUERY:
      // Handle remote SQL query execution
      // Enables transparent query routing across the cluster
      return this.handleRemoteQuery(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION:
      return this.handleTransactionMessage(payload);
    case PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION:
      return this.handleStartSplitReplication(payload);
    default:
      // Unknown message type - log and acknowledge to avoid blocking
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.UNKNOWN_MESSAGE_TYPE, {
        type: payload.type,
        partitionId: this.partitionId,
      });
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.unknownMessage(payload.type),
      };
    }
  }

  /**
   * Handle remote transaction control operations.
   * @param {Object} payload - Transaction message payload.
   * @return {Promise<Object>} Transaction operation response.
   * @private
   */
  async handleTransactionMessage(payload) {
    const operation = payload?.operation;
    const sessionId = payload?.sessionId || null;
    const transactionEpoch = Number.isFinite(payload?.transactionEpoch) ?
      Math.floor(payload.transactionEpoch) :
      null;

    try {
      let result;
      switch (operation) {
      case PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION:
      case 'BEGIN':
        result = await this.beginTransaction(sessionId, transactionEpoch);
        break;
      case PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION:
      case 'PREPARE':
        result = await this.prepareTransaction(sessionId);
        break;
      case PARTITION_SERVICE_OPERATION.COMMIT:
        result = await this.commitTransaction(sessionId);
        break;
      case PARTITION_SERVICE_OPERATION.ROLLBACK:
        result = await this.rollbackTransaction(sessionId);
        break;
      default:
        return {
          acknowledged: false,
          success: false,
          error: PARTITION_SERVICE_ERROR_MSG.unknownOperation(operation),
        };
      }

      return {
        acknowledged: true,
        success: result?.success === true,
        ...result,
      };
    } catch (error) {
      return {
        acknowledged: true,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract canonical application payload from transport envelopes.
   * Message-group direct deliveries wrap payloads as:
   * {messageId, payload, sourceGroup, sourceReplica}.
   * @param {Object} message - Incoming transport message/envelope.
   * @return {Object|null} Canonical payload.
   * @private
   */
  extractApplicationPayload(message) {
    const directPayload = message?.payload || message;
    if (directPayload &&
      typeof directPayload === 'object' &&
      !directPayload.type &&
      directPayload.payload &&
      typeof directPayload.payload === 'object') {
      return directPayload.payload;
    }
    return directPayload || null;
  }

  /**
   * Handle system table write operations from remote nodes.
   * This allows joining nodes to update system tables via CDC routing.
   * @param {Object} payload - Write operation payload.
   * @param {string} payload.operation - Operation type (INSERT, UPDATE, DELETE).
   * @param {string} payload.tableName - Target table name.
   * @param {Object} payload.data - Data for INSERT/UPDATE.
   * @param {Object} payload.whereClause - WHERE clause for UPDATE/DELETE.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async handleSystemTableWrite(payload) {
    const {operation, tableName, data, whereClause} = payload;

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.HANDLING_SYSTEM_TABLE_WRITE, {
      operation,
      tableName,
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });

    try {
      let result;
      switch (operation) {
      case PARTITION_SERVICE_OPERATION.INSERT:
        result = await this.insertData(tableName, data);
        break;
      case PARTITION_SERVICE_OPERATION.UPDATE:
        result = await this.updateData(tableName, whereClause, data);
        break;
      case PARTITION_SERVICE_OPERATION.DELETE:
        result = await this.deleteData(tableName, whereClause);
        break;
      case PARTITION_SERVICE_OPERATION.UPSERT:
        result = await this.upsertData(tableName, data);
        break;
      default:
        return {
          acknowledged: false,
          error: PARTITION_SERVICE_ERROR_MSG.unknownOperation(operation),
        };
      }

      return {
        acknowledged: true,
        success: result.success,
        changes: result.changes || NUM.ZERO,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.SYSTEM_TABLE_WRITE_FAILED, {
        operation,
        tableName,
        error: error.message,
        partitionId: this.partitionId,
      });
      throw error;
    }
  }

  /**
   * Handle remote SQL query execution.
   * Enables transparent query routing - any node can execute queries on any partition.
   * For write operations on non-leaders, returns a redirect response with leader address.
   * @param {Object} payload - Query payload.
   * @param {string} payload.sql - SQL query string.
   * @param {Array} payload.params - Query parameters.
   * @return {Promise<Object>} Query result or redirect response.
   * @private
   */
  async handleRemoteQuery(payload) {
    const {
      sql,
      params,
      splitMirrorOrigin,
      sessionId,
      [QUERY_PAYLOAD_FIELD_MIGRATION_OPERATION]: migrationOperation,
      [QUERY_PAYLOAD_FIELD_MIGRATION_ID]: migrationId,
    } = payload;

    if (!sql) {
      return {acknowledged: false, error: PARTITION_SERVICE_ERROR_MSG.MISSING_SQL_QUERY};
    }

    const isWriteOperation = this.isWriteQuery(sql);

    // For write operations, redirect to leader if we're not the leader
    if (isWriteOperation && this.role !== RaftRole.LEADER) {
      const leaderAddress = this.resolveLeaderAddress();
      if (leaderAddress) {
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.REDIRECTING_WRITE_TO_LEADER, {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          leaderAddress,
        });
        return {
          acknowledged: true,
          success: false,
          redirect: PARTITION_SERVICE_RESPONSE.LEADER_REDIRECT,
          leaderAddress,
          partitionId: this.partitionId,
        };
      }
      // No leader known - return error so client can retry
      return {
        acknowledged: true,
        success: false,
        error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
        partitionId: this.partitionId,
      };
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.HANDLING_REMOTE_QUERY, {
      sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });

    try {
      let result = null;
      if (migrationOperation === PARTITION_SERVICE_MIGRATION_OPERATION.ALTER_TABLE) {
        result = await this.executeMigrationAlterQuery(
          sql,
          params || [],
          {
            migrationId: migrationId || null,
            sessionId: sessionId || null,
          },
        );
      } else {
        result = await this.executeQuery(sql, params || [], {
          splitMirrorOrigin: splitMirrorOrigin || null,
          sessionId: sessionId || null,
        });
      }
      return {
        acknowledged: true,
        success: true,
        rows: result.rows,
        changes: result.changes,
        count: result.count,
        partitionId: this.partitionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.REMOTE_QUERY_FAILED, {
        sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
        error: error.message,
        partitionId: this.partitionId,
      });
      throw error;
    }
  }

  /**
   * Validate and start one source-partition split replication workflow.
   * The request is acknowledged once accepted; backfill/cutover continues
   * asynchronously on the source leader.
   * @param {Object} payload - Split replication request.
   * @return {Promise<Object>} ACK response.
   * @private
   */
  async handleStartSplitReplication(payload) {
    const transitionMetadata = payload?.transitionMetadata;
    const metadata = this.normalizeSplitTransitionMetadata(transitionMetadata);
    if (!metadata) {
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.INVALID_SPLIT_REPLICATION,
      };
    }

    this.logger.info(PARTITION_SERVICE_LOG_MSG.START_SPLIT_REPLICATION_REQUEST, {
      partitionId: this.partitionId,
      tableId: payload?.tableId || this.tableId,
      tableName: payload?.tableName || this.tableName,
      targetPartitionIds: metadata.targetPartitionIds,
      targetPartitionVersion: metadata.targetPartitionVersion,
    });

    if (this.role !== RaftRole.LEADER) {
      const leaderAddress = this.resolveLeaderAddress();
      if (leaderAddress && this.transport) {
        return this.transport.deliver(leaderAddress, {
          type: PARTITION_SERVICE_MESSAGE_TYPE.START_SPLIT_REPLICATION,
          partitionId: payload?.partitionId || this.partitionId,
          tableId: payload?.tableId || this.tableId,
          tableName: payload?.tableName || this.tableName,
          transitionMetadata,
        });
      }
      return {
        acknowledged: false,
        error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
      };
    }

    if (this.splitReplication &&
        this.isSameSplitReplication(this.splitReplication.metadata, metadata)) {
      return {acknowledged: true, success: true};
    }

    if (this.splitReplication) {
      return {
        acknowledged: false,
        error: PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      };
    }

    // Transient execution handle — the durable split phase is owned
    // by ManagedSplitWorkflow. This object caches active execution
    // context for the duration of runSplitReplicationWorkflow().
    this.splitReplication = {
      metadata,
      phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      pendingEntries: [],
      flushInFlight: false,
      startedAt: Date.now(),
      lastError: null,
    };
    this.splitReplicationRun = this.runSplitReplicationWorkflow()
      .catch((error) => {
        if (this.splitReplication) {
          this.splitReplication.lastError = error.message;
          this.splitReplication.phase =
            PARTITION_TRANSITION_STATE.FAILED;
        }
        this.logger.error(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_FAILED, {
          partitionId: this.partitionId,
          error: error.message,
        });
      });

    return {acknowledged: true, success: true};
  }

  /**
   * Execute one migration ALTER TABLE request through the Raft write path.
   * @param {string} sql - ALTER TABLE SQL.
   * @param {Array} params - SQL params.
   * @param {Object} options - Migration context.
   * @return {Promise<Object>} Execution result.
   * @private
   */
  async executeMigrationAlterQuery(sql, params = [], options = {}) {
    if (!sql) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.MIGRATION_ALTER_MISSING_SQL);
    }
    this.registerMigrationDefaultFromAlterSql(sql);
    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE,
      sql,
      params,
      migrationId: options.migrationId || null,
      sessionId: options.sessionId || null,
    });
  }

  /**
   * Parse and register one column default from ALTER TABLE ADD COLUMN SQL.
   * @param {string} sql - ALTER TABLE SQL.
   * @return {void}
   * @private
   */
  registerMigrationDefaultFromAlterSql(sql) {
    const parsed = this.parseAddColumnDefaultFromAlterSql(sql);
    if (!parsed || !parsed.columnName || !parsed.hasDefault) {
      return;
    }
    const tableKey = String(this.tableName || this.tableId || '');
    if (!tableKey) {
      return;
    }
    let columnDefaults = this.migrationColumnDefaultsByTable.get(tableKey);
    if (!columnDefaults) {
      columnDefaults = new Map();
      this.migrationColumnDefaultsByTable.set(tableKey, columnDefaults);
    }
    columnDefaults.set(parsed.columnName, parsed.defaultLiteral);
    this.logger.info(PARTITION_SERVICE_LOG_MSG.MIGRATION_DEFAULT_REGISTERED, {
      partitionId: this.partitionId,
      tableName: tableKey,
      columnName: parsed.columnName,
    });
  }

  /**
   * Extract one default literal from ALTER TABLE ... ADD COLUMN SQL.
   * @param {string} sql - ALTER TABLE SQL.
   * @return {Object|null} Parsed default metadata.
   * @private
   */
  parseAddColumnDefaultFromAlterSql(sql) {
    const normalizedSql = String(sql || '');
    const addColumnMatch = normalizedSql.match(
      /^\s*ALTER\s+TABLE\s+.+?\s+ADD\s+COLUMN\s+([^\s]+)\s+([\s\S]+)$/i,
    );
    if (!addColumnMatch) {
      return null;
    }

    const columnName = String(addColumnMatch[1] || '')
      .replace(/^["'`]|["'`]$/g, '');
    const definitionTail = String(addColumnMatch[2] || '');
    const defaultMatch = definitionTail.match(
      /\bDEFAULT\s+((?:'[^']*'|\"[^\"]*\"|`[^`]*`|[^\s,]+))/i,
    );
    return {
      columnName,
      hasDefault: defaultMatch !== null,
      defaultLiteral: defaultMatch ? defaultMatch[1] : null,
    };
  }

  /**
   * Check if a SQL query is a write operation.
   * @param {string} sql - SQL query string.
   * @return {boolean} True if write operation.
   * @private
   */
  isWriteQuery(sql) {
    if (!sql) return false;
    const trimmed = sql.trim().toUpperCase();
    return trimmed.startsWith('INSERT') ||
           trimmed.startsWith('UPDATE') ||
           trimmed.startsWith('DELETE') ||
           trimmed.startsWith('CREATE') ||
           trimmed.startsWith('DROP') ||
           trimmed.startsWith('ALTER');
  }

  /**
   * Apply a committed entry to the state machine.
   * This is called by liferaft when an entry is committed.
   * Requirements: 10.5
   * @param {Object} command - The committed command
   */
  applyCommittedEntry(command) {
    if (!command) {
      return;
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, {
      partitionId: this.partitionId,
      commandType: command.type,
    });

    // Handle different command types
    if (command.type === PARTITION_SERVICE_OPERATION.WRITE ||
        command.type === PARTITION_SERVICE_OPERATION.INSERT ||
        command.type === PARTITION_SERVICE_OPERATION.UPDATE ||
        command.type === PARTITION_SERVICE_OPERATION.DELETE ||
        command.type === PARTITION_SERVICE_OPERATION.UPSERT ||
        command.type === PARTITION_SERVICE_OPERATION.QUERY ||
        command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE) {
      // Apply SQL write operation
      if (command.sql) {
        if (command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE) {
          this.registerMigrationDefaultFromAlterSql(command.sql);
        }
        const entryKey = this.getCommittedEntryKey(command);
        if (entryKey && this.recentlyAppliedEntryKeys.has(entryKey)) {
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, {
            partitionId: this.partitionId,
            commandType: command.type,
            skippedReplay: true,
          });
          this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
            partitionId: this.partitionId,
            command,
          });
          return;
        }
        try {
          const stmt = this.db.prepare(command.sql);
          stmt.run(...(command.params || []));
          this.trackAppliedEntryKey(entryKey);

          // Generate CDC event only on the leader.
          // The leader already emits CDC in applyWrite(); followers
          // must not duplicate those events.
          if (this.isLeader) {
            this.generateCDCEvent(command).catch((err) => {
              this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_EVENT_FAILED, {
                partitionId: this.partitionId,
                error: err.message,
              });
            });
          }
        } catch (error) {
          if (this.isIdempotentInsertReplayConstraint(error, command)) {
            this.trackAppliedEntryKey(entryKey);
            this.logger.warn(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, {
              partitionId: this.partitionId,
              commandType: command.type,
              skippedReplay: true,
              replayConstraintSuppressed: true,
              error: error.message,
            });
            this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
              partitionId: this.partitionId,
              command,
            });
            return;
          }
          this.logger.error(PARTITION_SERVICE_ERROR_MSG.APPLY_COMMITTED_FAILED, {
            partitionId: this.partitionId,
            error: error.message,
            sql: command.sql ?
              command.sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_REDACTION_LIMIT) :
              null,
            params: command.params || [],
          });
          throw error;
        }
      }
    } else if (command.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT) {
      // Handle transaction commit - operations already applied
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRANSACTION_COMMIT_APPLIED, {
        partitionId: this.partitionId,
        operationCount: command.operations?.length || NUM.ZERO,
      });
    }

    this.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, {
      partitionId: this.partitionId,
      command,
    });
  }

  /**
   * Resolve the canonical transaction session ID.
   * @param {string|null} sessionId - Requested session ID.
   * @return {string} Canonical session ID.
   * @private
   */
  normalizeTransactionSessionId(sessionId) {
    return typeof sessionId === 'string' && sessionId.length > NUM.ZERO ?
      sessionId :
      DEFAULT_TRANSACTION_SESSION_ID;
  }

  /**
   * Resolve one active session ID for transaction operations.
   * @param {string|null} sessionId - Requested session ID.
   * @return {string|null} Active session ID or null.
   * @private
   */
  resolveActiveTransactionSessionId(sessionId) {
    if (typeof sessionId === 'string' && sessionId.length > NUM.ZERO) {
      return sessionId;
    }
    if (this.activeTransactions.has(DEFAULT_TRANSACTION_SESSION_ID)) {
      return DEFAULT_TRANSACTION_SESSION_ID;
    }
    if (this.activeTransactions.size === NUM.ONE) {
      return this.activeTransactions.keys().next().value || null;
    }
    return null;
  }

  /**
   * Synchronize legacy transaction aliases for compatibility.
   * @private
   */
  syncLegacyTransactionAliases() {
    const defaultState = this.activeTransactions.get(DEFAULT_TRANSACTION_SESSION_ID);
    const fallbackState = this.activeTransactions.size === NUM.ONE ?
      this.activeTransactions.values().next().value :
      null;
    const activeState = defaultState || fallbackState || null;
    this.activeTransaction = activeState;
    this.transactionOperations = activeState?.operations || [];
  }

  /**
   * Resolve one transaction state by session.
   * @param {string|null} sessionId - Requested session ID.
   * @return {{sessionId: string, state: Object}|null} Resolved state.
   * @private
   */
  resolveActiveTransactionState(sessionId = null) {
    const resolvedSessionId = this.resolveActiveTransactionSessionId(sessionId);
    if (!resolvedSessionId) {
      return null;
    }
    const state = this.activeTransactions.get(resolvedSessionId) || null;
    if (!state) {
      return null;
    }
    return {
      sessionId: resolvedSessionId,
      state,
    };
  }

  /**
   * Resolve one prepared session ID for transaction operations.
   * @param {string|null} sessionId - Requested session ID.
   * @return {string|null} Prepared session ID or null.
   * @private
   */
  resolvePreparedTransactionSessionId(sessionId) {
    if (typeof sessionId === 'string' && sessionId.length > NUM.ZERO) {
      return sessionId;
    }
    if (this.preparedTransactions.has(DEFAULT_TRANSACTION_SESSION_ID)) {
      return DEFAULT_TRANSACTION_SESSION_ID;
    }
    if (this.preparedTransactions.size === NUM.ONE) {
      return this.preparedTransactions.keys().next().value || null;
    }
    return null;
  }

  /**
   * Resolve one prepared transaction state by session.
   * @param {string|null} sessionId - Requested session ID.
   * @return {{sessionId: string, state: Object}|null} Resolved state.
   * @private
   */
  resolvePreparedTransactionState(sessionId = null) {
    const resolvedSessionId = this.resolvePreparedTransactionSessionId(sessionId);
    if (!resolvedSessionId) {
      return null;
    }
    const state = this.preparedTransactions.get(resolvedSessionId) || null;
    if (!state) {
      return null;
    }
    return {
      sessionId: resolvedSessionId,
      state,
    };
  }

  /**
   * Build one prepare-lost response payload.
   * @param {string} operation - Transaction operation.
   * @param {string|null} sessionId - Session ID.
   * @return {Object} Prepare-lost response payload.
   * @private
   */
  buildPrepareLostResponse(operation, sessionId = null) {
    return {
      success: false,
      operation,
      partitionId: this.partitionId,
      sessionId: this.normalizeTransactionSessionId(sessionId),
      error: PARTITION_SERVICE_ERROR_MSG.PREPARE_LOST,
    };
  }

  /**
   * Reconstruct prepared transaction state from the persisted Raft log.
   * @return {{preparedTransactionCount: number, prepareLostCount: number}}
   *   Reconstruction summary.
   */
  reconstructPreparedState() {
    const reconstructedPreparedTransactions = new Map();
    const terminalSessions = new Set();
    const prepareLostSessions = new Set();
    const logEntries = this.storage?.getEntriesFrom(NUM.ONE) || [];

    for (const logEntry of logEntries) {
      const data = logEntry?.data || null;
      if (!data || typeof data !== 'object') {
        continue;
      }
      const sessionId = this.normalizeTransactionSessionId(data.sessionId || null);
      if (!sessionId) {
        continue;
      }

      if (data.type === PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION) {
        if (!Array.isArray(data.writeSet)) {
          prepareLostSessions.add(sessionId);
          reconstructedPreparedTransactions.delete(sessionId);
          continue;
        }
        reconstructedPreparedTransactions.set(sessionId, {
          sessionId,
          transactionEpoch: Number.isFinite(data.epoch) ?
            data.epoch :
            null,
          startTime: Number.isFinite(data.proposedAt) ?
            data.proposedAt :
            Date.now(),
          operations: [],
          writeSet: new Set(data.writeSet),
          readSet: new Set(),
          raftLogIndex: Number.isFinite(logEntry?.index) ?
            logEntry.index :
            null,
          preparedAt: Number.isFinite(data.proposedAt) ?
            data.proposedAt :
            Date.now(),
        });
        continue;
      }

      if (data.type === PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT ||
          data.type === PARTITION_SERVICE_OPERATION.COMMIT ||
          data.type === PARTITION_SERVICE_OPERATION.ROLLBACK) {
        terminalSessions.add(sessionId);
        reconstructedPreparedTransactions.delete(sessionId);
        prepareLostSessions.delete(sessionId);
      }
    }

    this.preparedTransactions.clear();
    for (const [sessionId, state] of reconstructedPreparedTransactions.entries()) {
      if (terminalSessions.has(sessionId)) {
        continue;
      }
      this.preparedTransactions.set(sessionId, state);
    }
    for (const sessionId of terminalSessions) {
      this.preparedStateLostSessions.delete(sessionId);
    }
    for (const sessionId of prepareLostSessions) {
      this.preparedTransactions.delete(sessionId);
      this.preparedStateLostSessions.add(sessionId);
    }
    this.syncLegacyTransactionAliases();

    return {
      preparedTransactionCount: this.preparedTransactions.size,
      prepareLostCount: this.preparedStateLostSessions.size,
    };
  }

  /**
   * Resolve the primary-key column used for write-set tracking.
   * @return {string|null} Primary-key column name.
   * @private
   */
  resolveTransactionPrimaryKeyColumn() {
    if (!this.schema || !Array.isArray(this.schema.columns)) {
      return null;
    }
    const primaryKeyColumn = this.schema.columns.find((column) => column.primaryKey);
    return primaryKeyColumn?.name || null;
  }

  /**
   * Resolve one write-set key from a transaction entry.
   * @param {Object} entry - Transaction write entry.
   * @return {string|null} Write-set key.
   * @private
   */
  resolveTransactionWriteSetKey(entry) {
    const primaryKeyColumn = this.resolveTransactionPrimaryKeyColumn();
    if (!primaryKeyColumn) {
      return null;
    }
    const tableName = entry.tableName || this.tableName;
    if (entry?.whereClause &&
        Object.prototype.hasOwnProperty.call(entry.whereClause, primaryKeyColumn)) {
      return `${tableName}:${entry.whereClause[primaryKeyColumn]}`;
    }
    if (entry?.data &&
        Object.prototype.hasOwnProperty.call(entry.data, primaryKeyColumn)) {
      return `${tableName}:${entry.data[primaryKeyColumn]}`;
    }

    try {
      const routingKey = this.extractSplitRoutingKey(entry, primaryKeyColumn);
      if (routingKey === undefined || routingKey === null) {
        return null;
      }
      return `${tableName}:${routingKey}`;
    } catch (_err) {
      return null;
    }
  }

  /**
   * Track one transaction write-set key.
   * @param {Object} transactionState - Active transaction state.
   * @param {Object} entry - Transaction write entry.
   * @private
   */
  trackTransactionWriteSetKey(transactionState, entry) {
    const writeSetKey = this.resolveTransactionWriteSetKey(entry);
    if (!writeSetKey) {
      return;
    }
    transactionState.writeSet.add(writeSetKey);
  }

  /**
   * Check whether a write set conflicts with later committed writes.
   * @param {Set<string>} writeSet - Transaction write set.
   * @param {number|null} transactionEpoch - Transaction snapshot epoch.
   * @return {Object} Conflict check result.
   */
  checkWriteConflicts(writeSet, transactionEpoch) {
    if (!(writeSet instanceof Set) || writeSet.size === NUM.ZERO) {
      return {hasConflict: false, conflicts: []};
    }
    if (!Number.isFinite(transactionEpoch)) {
      return {hasConflict: false, conflicts: []};
    }

    const conflicts = [];
    for (const commitRecord of this.committedWriteLog) {
      if (!Number.isFinite(commitRecord?.epoch) ||
          commitRecord.epoch <= transactionEpoch) {
        continue;
      }
      for (const key of writeSet) {
        if (!commitRecord.writeSet.has(key)) {
          continue;
        }
        conflicts.push({
          key,
          conflictingEpoch: commitRecord.epoch,
        });
      }
    }

    return {
      hasConflict: conflicts.length > NUM.ZERO,
      conflicts,
    };
  }

  /**
   * Resolve oldest retained commit epoch from the write log.
   * @return {number|null} Oldest retained commit epoch.
   * @private
   */
  getOldestRetainedCommitEpoch() {
    let oldest = null;
    for (const commitRecord of this.committedWriteLog) {
      if (!Number.isFinite(commitRecord?.epoch)) {
        continue;
      }
      if (oldest === null || commitRecord.epoch < oldest) {
        oldest = commitRecord.epoch;
      }
    }
    return oldest;
  }

  /**
   * Determine whether a transaction snapshot epoch is no longer available.
   * @param {number|null} transactionEpoch - Transaction snapshot epoch.
   * @return {boolean} True when snapshot history has expired.
   * @private
   */
  isSnapshotExpired(transactionEpoch) {
    if (!Number.isFinite(transactionEpoch)) {
      return false;
    }
    if (this.committedWriteLog.length < this.maxCommittedWriteLogEntries) {
      return false;
    }
    const oldestRetainedEpoch = this.getOldestRetainedCommitEpoch();
    if (!Number.isFinite(oldestRetainedEpoch)) {
      return false;
    }
    return transactionEpoch < oldestRetainedEpoch;
  }

  /**
   * Apply snapshot visibility filtering for transactional reads.
   * @param {Object[]} rows - SQLite result rows.
   * @param {Object} transactionState - Active transaction state.
   * @return {Object[]} Snapshot-visible rows.
   * @private
   */
  applySnapshotReadFilter(rows, transactionState) {
    if (!transactionState || !Number.isFinite(transactionState.transactionEpoch)) {
      return rows;
    }

    if (this.isSnapshotExpired(transactionState.transactionEpoch)) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.SNAPSHOT_EXPIRED);
    }

    const primaryKeyColumn = this.resolveTransactionPrimaryKeyColumn();
    if (!primaryKeyColumn) {
      return rows;
    }

    const filteredRows = [];
    for (const row of rows) {
      const primaryKeyValue = row?.[primaryKeyColumn];
      const writeSetKey = `${this.tableName}:${primaryKeyValue}`;
      const isOwnWrite = transactionState.writeSet.has(writeSetKey);
      const commitEpoch = this.rowCommitEpoch.get(writeSetKey);
      const committedBeforeSnapshot = !Number.isFinite(commitEpoch) ||
        commitEpoch < transactionState.transactionEpoch;
      if (!isOwnWrite && !committedBeforeSnapshot) {
        continue;
      }
      transactionState.readSet.add(writeSetKey);
      filteredRows.push(row);
    }
    return filteredRows;
  }

  /**
   * Trim retained commit history to the configured maximum.
   * @private
   */
  pruneCommittedWriteLog() {
    while (this.committedWriteLog.length > this.maxCommittedWriteLogEntries) {
      this.committedWriteLog.shift();
    }
  }

  /**
   * Release prepared transaction state that exceeded the hold timeout.
   * @param {number} [nowMs] - Clock override for deterministic tests.
   * @return {number} Number of released prepared transactions.
   */
  enforcePreparedStateHoldTimeouts(nowMs = Date.now()) {
    const expiredPreparedSessions = [];
    for (const [sessionId, state] of this.preparedTransactions.entries()) {
      if (!Number.isFinite(state?.preparedAt)) {
        continue;
      }
      const holdDurationMs = nowMs - state.preparedAt;
      if (holdDurationMs < this.preparedStateHoldTimeoutMs) {
        continue;
      }
      expiredPreparedSessions.push({
        sessionId,
        holdDurationMs,
        preparedAt: state.preparedAt,
      });
    }

    if (expiredPreparedSessions.length === NUM.ZERO) {
      return NUM.ZERO;
    }

    try {
      this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
    } catch (error) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.ROLLBACK_TRANSACTION_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
    }

    for (const expiredSession of expiredPreparedSessions) {
      this.preparedTransactions.delete(expiredSession.sessionId);
      this.activeTransactions.delete(expiredSession.sessionId);
      this.preparedStateLostSessions.add(expiredSession.sessionId);
      this.logger.warn(PARTITION_SERVICE_LOG_MSG.PREPARED_STATE_HOLD_TIMEOUT, {
        partitionId: this.partitionId,
        transactionId: expiredSession.sessionId,
        sessionId: expiredSession.sessionId,
        holdDurationMs: expiredSession.holdDurationMs,
        preparedAt: expiredSession.preparedAt,
      });
    }
    this.syncLegacyTransactionAliases();
    return expiredPreparedSessions.length;
  }

  /**
   * Start periodic prepared-state hold-timeout enforcement.
   * @private
   */
  startPreparedStateHoldTimeoutSweep() {
    if (this.preparedStateHoldTimer) {
      return;
    }
    if (this.isShutdown) {
      this.logger.debug(
        PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, {
          partitionId: this.partitionId,
          timer: 'preparedStateHoldTimer',
        });
      return;
    }
    this.preparedStateHoldTimer = setInterval(() => {
      this.enforcePreparedStateHoldTimeouts(Date.now());
    }, this.preparedStateHoldSweepIntervalMs);
    this.preparedStateHoldTimer.unref();
  }

  /**
   * Stop periodic prepared-state hold-timeout enforcement.
   * @private
   */
  stopPreparedStateHoldTimeoutSweep() {
    if (this.preparedStateHoldTimer) {
      clearInterval(this.preparedStateHoldTimer);
      this.preparedStateHoldTimer = null;
    }
  }


  /**
   * Begin a transaction on this partition.
   * Uses SQLite's transaction support for READ COMMITTED isolation.
   * @param {string} [sessionId] - Transaction session ID.
   * @param {number} [transactionEpoch] - Snapshot epoch for this transaction.
   * @return {Promise<Object>} Transaction result.
   */
  async beginTransaction(sessionId = null, transactionEpoch = null) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const transactionSessionId = this.normalizeTransactionSessionId(sessionId);
    if (this.activeTransactions.has(transactionSessionId) ||
      this.activeTransactions.size > NUM.ZERO) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
    }
    this.preparedStateLostSessions.delete(transactionSessionId);

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.BEGINNING_TRANSACTION, {
      partitionId: this.partitionId,
      sessionId: transactionSessionId,
      transactionEpoch,
    });

    try {
      // Use SQLite's BEGIN for transaction support
      this.db.exec(PARTITION_SERVICE_SQL.BEGIN_IMMEDIATE);
      const transactionState = {
        sessionId: transactionSessionId,
        transactionEpoch,
        startTime: Date.now(),
        operations: [],
        writeSet: new Set(),
        readSet: new Set(),
      };
      this.activeTransactions.set(transactionSessionId, transactionState);
      this.syncLegacyTransactionAliases();

      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
        partitionId: this.partitionId,
        inTransaction: true,
        sessionId: transactionSessionId,
        transactionEpoch,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.BEGIN_TRANSACTION_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Prepare one active transaction on this partition.
   * @param {string|null} sessionId - Transaction session ID.
   * @return {Promise<Object>} Prepare result.
   */
  async prepareTransaction(sessionId = null) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const transaction = this.resolveActiveTransactionState(sessionId) ||
      this.resolvePreparedTransactionState(sessionId);
    if (!transaction) {
      return {
        success: false,
        operation: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
        partitionId: this.partitionId,
        error: PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_PREPARE,
      };
    }
    const {
      sessionId: transactionSessionId,
      state: transactionState,
    } = transaction;

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.PREPARING_TRANSACTION, {
      partitionId: this.partitionId,
      sessionId: transactionSessionId,
      operationCount: transactionState.operations.length,
      writeSetSize: transactionState.writeSet.size,
    });

    const conflictCheck = this.checkWriteConflicts(
      transactionState.writeSet,
      transactionState.transactionEpoch,
    );
    if (conflictCheck.hasConflict) {
      return {
        success: false,
        operation: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
        partitionId: this.partitionId,
        error: PARTITION_SERVICE_ERROR_MSG.PREPARE_CONFLICT,
        conflicts: conflictCheck.conflicts,
      };
    }

    const raftEntry = await this.replicatePreparedTransaction(
      transactionSessionId,
      transactionState,
    );
    this.activeTransactions.delete(transactionSessionId);
    this.preparedTransactions.set(transactionSessionId, {
      sessionId: transactionSessionId,
      transactionEpoch: transactionState.transactionEpoch,
      startTime: transactionState.startTime,
      operations: transactionState.operations,
      writeSet: transactionState.writeSet,
      readSet: transactionState.readSet,
      raftLogIndex: raftEntry?.index || null,
      preparedAt: Date.now(),
    });
    this.syncLegacyTransactionAliases();

    return {
      success: true,
      operation: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
      partitionId: this.partitionId,
      prepared: true,
      sessionId: transactionSessionId,
      raftLogIndex: raftEntry?.index || null,
    };
  }

  /**
   * Commit the active transaction.
   * Ensures durability through Raft replication before acknowledging.
   * @return {Promise<Object>} Commit result.
   */
  async commitTransaction(sessionId = null) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    const transactionSessionId = this.normalizeTransactionSessionId(sessionId);
    if (this.preparedStateLostSessions.has(transactionSessionId)) {
      return this.buildPrepareLostResponse(
        PARTITION_SERVICE_OPERATION.COMMIT,
        transactionSessionId,
      );
    }

    const transaction = this.resolveActiveTransactionState(transactionSessionId) ||
      this.resolvePreparedTransactionState(transactionSessionId);
    if (!transaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION_COMMIT);
    }
    const {
      sessionId: resolvedSessionId,
      state: transactionState,
    } = transaction;

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.COMMITTING_TRANSACTION, {
      partitionId: this.partitionId,
      sessionId: resolvedSessionId,
      operationCount: transactionState.operations.length,
    });

    try {
      // Replicate transaction operations through Raft for durability
      const raftEntry = await this.replicateTransactionCommit(
        transactionState.operations,
        resolvedSessionId,
        transactionState.transactionEpoch,
      );

      // Commit in SQLite
      this.db.exec(PARTITION_SERVICE_SQL.COMMIT);

      const duration = Date.now() - transactionState.startTime;
      const operationCount = transactionState.operations.length;

      // Generate CDC events for all operations
      for (const op of transactionState.operations) {
        await this.generateCDCEvent(op);
      }

      if (transactionState.writeSet.size > NUM.ZERO) {
        const committedAt = Date.now();
        for (const writeSetKey of transactionState.writeSet) {
          this.rowCommitEpoch.set(
            writeSetKey,
            Number.isFinite(transactionState.transactionEpoch) ?
              transactionState.transactionEpoch :
              committedAt,
          );
        }
        this.committedWriteLog.push({
          epoch: transactionState.transactionEpoch,
          writeSet: new Set(transactionState.writeSet),
          committedAt,
        });
        this.pruneCommittedWriteLog();
      }
      this.activeTransactions.delete(resolvedSessionId);
      this.preparedTransactions.delete(resolvedSessionId);
      this.preparedStateLostSessions.delete(resolvedSessionId);
      this.syncLegacyTransactionAliases();

      // Schedule size update
      this.scheduleSizeUpdate();

      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.COMMIT,
        partitionId: this.partitionId,
        committed: true,
        durationMs: duration,
        operationCount,
        raftLogIndex: raftEntry?.index || null,
        sessionId: resolvedSessionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.COMMIT_TRANSACTION_FAILED, {
        partitionId: this.partitionId,
        sessionId: resolvedSessionId,
        error: error.message,
      });

      // Rollback on failure
      try {
        this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);
      } catch (_rollbackErr) {
        // Ignore rollback errors
      }

      this.activeTransactions.delete(resolvedSessionId);
      this.preparedTransactions.delete(resolvedSessionId);
      this.syncLegacyTransactionAliases();

      throw error;
    }
  }

  /**
   * Rollback the active transaction.
   * @return {Promise<Object>} Rollback result.
   */
  async rollbackTransaction(sessionId = null) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    const transactionSessionId = this.normalizeTransactionSessionId(sessionId);
    if (this.preparedStateLostSessions.has(transactionSessionId)) {
      return this.buildPrepareLostResponse(
        PARTITION_SERVICE_OPERATION.ROLLBACK,
        transactionSessionId,
      );
    }

    const transaction = this.resolveActiveTransactionState(transactionSessionId) ||
      this.resolvePreparedTransactionState(transactionSessionId);
    if (!transaction) {
      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.ROLLBACK,
        partitionId: this.partitionId,
        rolledBack: true,
        idempotent: true,
        sessionId: transactionSessionId,
      };
    }
    const {
      sessionId: resolvedSessionId,
      state: transactionState,
    } = transaction;

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.ROLLING_BACK_TRANSACTION, {
      partitionId: this.partitionId,
      sessionId: resolvedSessionId,
      operationCount: transactionState.operations.length,
    });

    try {
      const raftEntry = await this.replicateTransactionRollback(
        resolvedSessionId,
        transactionState.transactionEpoch,
      );

      // Rollback in SQLite - this reverts all changes
      this.db.exec(PARTITION_SERVICE_SQL.ROLLBACK);

      const duration = Date.now() - transactionState.startTime;
      const operationCount = transactionState.operations.length;

      // Clear transaction state
      this.activeTransactions.delete(resolvedSessionId);
      this.preparedTransactions.delete(resolvedSessionId);
      this.preparedStateLostSessions.delete(resolvedSessionId);
      this.syncLegacyTransactionAliases();

      return {
        success: true,
        operation: PARTITION_SERVICE_OPERATION.ROLLBACK,
        partitionId: this.partitionId,
        rolledBack: true,
        durationMs: duration,
        operationCount,
        sessionId: resolvedSessionId,
        raftLogIndex: raftEntry?.index || null,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.ROLLBACK_TRANSACTION_FAILED, {
        partitionId: this.partitionId,
        sessionId: resolvedSessionId,
        error: error.message,
      });

      // Clear transaction state anyway
      this.activeTransactions.delete(resolvedSessionId);
      this.preparedTransactions.delete(resolvedSessionId);
      this.syncLegacyTransactionAliases();

      throw error;
    }
  }

  /**
   * Check if a transaction is active.
   * @return {boolean} True if transaction is active.
   */
  isInTransaction() {
    return this.activeTransactions.size > NUM.ZERO;
  }

  /**
   * Replicate transaction commit through Raft for durability.
   * @return {Promise<Object>} Raft log entry.
   * @private
   */
  async replicateTransactionCommit(
    operations = [],
    sessionId = null,
    transactionEpoch = null,
  ) {
    const timestamp = this.hlcClock.now();

    const entry = {
      type: PARTITION_SERVICE_OPERATION.TRANSACTION_COMMIT,
      sessionId,
      transactionEpoch,
      operations: Array.isArray(operations) ? operations : [],
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    // Append to Raft log
    const logEntry = this.storage.appendEntry(entry);

    // Replicate to followers via liferaft if we're the leader
    // liferaft handles replication through its heartbeat mechanism
    // Only use liferaft's command if it considers itself the leader
    // For single-replica groups, liferaft may not be in LEADER state
    // Requirements: 11.9
    const isLiferaftLeader = this.raft && this.raft.state === LifeRaft.LEADER;
    if (isLiferaftLeader) {
      this.raftProvider.propose(this.raft, entry, (err) => {
        if (err) {
          this.logger.debug(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_COMMIT_RAFT_FAILED, {
            partitionId: this.partitionId,
            error: err.message,
          });
        }
      });
    }

    return logEntry;
  }

  /**
   * Replicate one transaction rollback marker through Raft.
   * @param {string} sessionId - Transaction session ID.
   * @param {number|null} transactionEpoch - Transaction snapshot epoch.
   * @return {Promise<Object>} Raft log entry.
   * @private
   */
  async replicateTransactionRollback(sessionId = null, transactionEpoch = null) {
    const timestamp = this.hlcClock.now();
    const entry = {
      type: PARTITION_SERVICE_OPERATION.ROLLBACK,
      sessionId,
      transactionEpoch,
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    const logEntry = this.storage.appendEntry(entry);

    const isLiferaftLeader = this.raft && this.raft.state === LifeRaft.LEADER;
    if (isLiferaftLeader) {
      this.raftProvider.propose(this.raft, entry, (err) => {
        if (err) {
          this.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, {
            partitionId: this.partitionId,
            error: err.message,
          });
        }
      });
    }

    return logEntry;
  }

  /**
   * Replicate prepared transaction state through Raft for durability.
   * @param {string} sessionId - Transaction session ID.
   * @param {Object} transactionState - Active transaction state.
   * @return {Promise<Object>} Raft log entry.
   * @private
   */
  async replicatePreparedTransaction(sessionId, transactionState) {
    const timestamp = this.hlcClock.now();
    const entry = {
      type: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
      sessionId,
      epoch: transactionState.transactionEpoch,
      writeSet: [...transactionState.writeSet],
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    const logEntry = this.storage.appendEntry(entry);

    const isLiferaftLeader = this.raft && this.raft.state === LifeRaft.LEADER;
    if (isLiferaftLeader) {
      this.raftProvider.propose(this.raft, entry, (err) => {
        if (err) {
          this.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, {
            partitionId: this.partitionId,
            error: err.message,
          });
        }
      });
    }

    return logEntry;
  }

  /**
   * Execute a SQL query on this partition.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   */
  async executeQuery(sql, params = [], options = {}) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
      sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
    });

    try {
      const stmt = this.db.prepare(sql);
      const isSelect = sql.trim().toUpperCase().startsWith(SQL.SELECT);

      if (isSelect) {
        const sqliteStartMs = Date.now();
        const rows = stmt.all(...params);
        const transaction = this.resolveActiveTransactionState(
          options.sessionId || null,
        );
        const visibleRows = transaction ?
          this.applySnapshotReadFilter(rows, transaction.state) :
          rows;
        const durationMs = Date.now() - sqliteStartMs;
        try {
          this.logger.info(METRICS_LOG_TAG.PARTITION_SQLITE, {
            partitionId: this.partitionId,
            operation: 'select',
            durationMs,
            rowCount: visibleRows.length,
          });
        } catch (_metricsErr) {
          // Metrics logging must not propagate to callers
        }
        return {
          success: true,
          rows: visibleRows,
          count: visibleRows.length,
          partitionId: this.partitionId,
        };
      } else {
        // Only reuse the transactional write path when this request resolves
        // to the active transaction session for the partition.
        const transaction = this.resolveActiveTransactionState(
          options.sessionId || null,
        );
        if (transaction) {
          return this.executeTransactionWrite({
            type: PARTITION_SERVICE_OPERATION.QUERY,
            sql,
            params,
            splitMirrorOrigin: options.splitMirrorOrigin || null,
          }, transaction.sessionId);
        }
        // For write operations outside transaction, go through Raft
        return this.proposeWrite({
          type: PARTITION_SERVICE_OPERATION.QUERY,
          sql,
          params,
          splitMirrorOrigin: options.splitMirrorOrigin || null,
        });
      }
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Execute a SQL query directly on the local SQLite database.
   * Bootstrap-only helper: bypasses Raft and does not replicate.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   */
  async executeLocalQuery(sql, params = []) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
      sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
      bootstrap: true,
    });

    try {
      const stmt = this.db.prepare(sql);
      const isSelect = sql.trim().toUpperCase().startsWith(SQL.SELECT);

      if (isSelect) {
        const rows = stmt.all(...params);
        return {
          success: true,
          rows,
          count: rows.length,
          partitionId: this.partitionId,
        };
      }

      const info = stmt.run(...params);
      this.scheduleSizeUpdate();
      return {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a write operation within an active transaction.
   * @param {Object} operation - Write operation.
   * @param {string|null} sessionId - Transaction session ID.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async executeTransactionWrite(operation, sessionId = null) {
    const transaction = this.resolveActiveTransactionState(sessionId);
    if (!transaction) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NO_ACTIVE_TRANSACTION);
    }
    const {
      sessionId: transactionSessionId,
      state: transactionState,
    } = transaction;

    const timestamp = this.hlcClock.now();

    const entry = {
      ...operation,
      sessionId: transactionSessionId,
      entryId: operation.entryId || randomUUID(),
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };

    try {
      const stmt = this.db.prepare(entry.sql);
      const info = stmt.run(...(entry.params || []));

      // Track operation for later CDC generation and Raft replication
      const trackedEntry = {
        ...entry,
        changes: info.changes,
      };
      transactionState.operations.push(trackedEntry);
      this.trackTransactionWriteSetKey(transactionState, trackedEntry);
      this.syncLegacyTransactionAliases();

      return {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
        inTransaction: true,
        sessionId: transactionSessionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.TRANSACTION_WRITE_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Insert data into the partition.
   * @param {string} tableName - Table name.
   * @param {Object} data - Data to insert.
   * @return {Promise<Object>} Insert result.
   */
  async insertData(tableName, data, options) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns
      .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const sql = `${SQL.INSERT_INTO} ${tableName} ` +
      `(${columns.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE)}) ` +
      `${SQL.VALUES} (${placeholders})`;

    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.INSERT,
      tableName,
      data,
      sql,
      params: values,
    }, options);
  }

  /**
   * Update data in the partition.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause conditions.
   * @param {Object} data - Data to update.
   * @return {Promise<Object>} Update result.
   */
  async updateData(tableName, whereClause, data, options) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const setClauses = Object.keys(data)
      .map((k) => `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const whereClauses = Object.keys(whereClause)
      .map((k) => `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.AND);
    const sql = `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClauses} ` +
      `${SQL.WHERE} ${whereClauses}`;
    const params = [...Object.values(data), ...Object.values(whereClause)];

    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.UPDATE,
      tableName,
      data,
      whereClause,
      sql,
      params,
    }, options);
  }

  /**
   * Delete data from the partition.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause conditions.
   * @return {Promise<Object>} Delete result.
   */
  async deleteData(tableName, whereClause, options) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const whereClauses = Object.keys(whereClause)
      .map((k) => `${k} = ${PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK}`)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.AND);
    const sql = `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereClauses}`;
    const params = Object.values(whereClause);

    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.DELETE,
      tableName,
      whereClause,
      sql,
      params,
    }, options);
  }

  /**
   * Upsert data in the partition (insert or replace on conflict).
   * @param {string} tableName - Table name.
   * @param {Object} data - Data to upsert.
   * @return {Promise<Object>} Upsert result.
   */
  async upsertData(tableName, data, options) {
    if (!this.initialized) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns
      .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const sql = `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} ` +
      `(${columns.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE)}) ` +
      `${SQL.VALUES} (${placeholders})`;

    return this.proposeWrite({
      type: PARTITION_SERVICE_OPERATION.UPSERT,
      tableName,
      data,
      sql,
      params: values,
    }, options);
  }

  /**
   * Resolve write-correlation identifiers for metrics payloads.
   * @param {Object} entry - Write entry.
   * @return {Object}
   * @private
   */
  resolveWriteMetricCorrelation(entry) {
    const requestId = this.normalizeMetricIdentifier(
      entry?.requestId || entry?.request_id,
    );
    const correlationId = this.normalizeMetricIdentifier(
      entry?.correlationId || entry?.correlation_id,
    );
    const operationId = this.normalizeMetricIdentifier(
      entry?.operationId || entry?.operation_id || entry?.id,
    ) ||
      requestId ||
      correlationId ||
      this.partitionId + ':' + this.replicaId + ':' + String(entry?.proposedAt || Date.now());

    return {
      operationId,
      requestId,
      correlationId: correlationId || requestId || operationId,
    };
  }

  /**
   * Normalize identifier-like values for metric payload fields.
   * @param {*} value - Candidate value.
   * @return {string|null}
   * @private
   */
  normalizeMetricIdentifier(value) {
    if (value === null || value === undefined) {
      return null;
    }
    const normalized = String(value).trim();
    return normalized.length > NUM.ZERO ? normalized : null;
  }

  /**
   * Record a write phase timing duration.
   * @param {Object|null} phaseTimings - Target phase timing object.
   * @param {string} field - Phase field name.
   * @param {number} startedAtMs - Phase start timestamp.
   * @private
   */
  recordWritePhaseDuration(phaseTimings, field, startedAtMs) {
    if (!phaseTimings || !Number.isFinite(startedAtMs)) {
      return;
    }
    const durationMs = Math.max(NUM.ZERO, Date.now() - startedAtMs);
    phaseTimings[field] = durationMs;
  }

  /**
   * Merge baseline and measured write phase timings for metric payloads.
   * @param {Object} phaseTimings - Measured phase timings.
   * @param {number} totalDurationMs - End-to-end write duration.
   * @param {number} entryBuildMs - Entry-construction duration.
   * @return {Object}
   * @private
   */
  buildWritePhaseTimingPayload(phaseTimings, totalDurationMs, entryBuildMs) {
    return {
      [WRITE_PHASE_FIELD_ENTRY_BUILD_MS]: entryBuildMs,
      [WRITE_PHASE_FIELD_FORWARD_DELIVER_MS]:
        phaseTimings?.[WRITE_PHASE_FIELD_FORWARD_DELIVER_MS] || NUM.ZERO,
      [WRITE_PHASE_FIELD_LOG_APPEND_MS]:
        phaseTimings?.[WRITE_PHASE_FIELD_LOG_APPEND_MS] || NUM.ZERO,
      [WRITE_PHASE_FIELD_SQLITE_RUN_MS]:
        phaseTimings?.[WRITE_PHASE_FIELD_SQLITE_RUN_MS] || NUM.ZERO,
      [WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS]:
        phaseTimings?.[WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS] || NUM.ZERO,
      [WRITE_PHASE_FIELD_APPLY_WRITE_MS]:
        phaseTimings?.[WRITE_PHASE_FIELD_APPLY_WRITE_MS] || NUM.ZERO,
      [WRITE_PHASE_FIELD_TOTAL_MS]: Math.max(NUM.ZERO, totalDurationMs),
    };
  }

  /**
   * Propose a write operation through Raft.
   * @param {Object} operation - Write operation.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async proposeWrite(operation, options) {
    const proposeStartMs = Date.now();
    const timestamp = this.hlcClock.now();
    const entryBuildStartMs = Date.now();

    const entry = {
      ...operation,
      entryId: operation.entryId || randomUUID(),
      timestamp: timestamp.toString(),
      proposedBy: this.replicaId,
      proposedAt: Date.now(),
    };
    const entryBuildMs = Math.max(NUM.ZERO, Date.now() - entryBuildStartMs);
    const correlation = this.resolveWriteMetricCorrelation(entry);

    const isLeader = this.role === RaftRole.LEADER;

    // If we're the leader, append and replicate
    if (isLeader) {
      const phaseTimings = {};
      const result = await this.applyWrite(entry, phaseTimings);
      const durationMs = Date.now() - proposeStartMs;
      try {
        this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, {
          partitionId: this.partitionId,
          durationMs,
          isLeader: true,
          forwarded: false,
          operationId: correlation.operationId,
          requestId: correlation.requestId,
          correlationId: correlation.correlationId,
          acknowledged: result?.success === true,
          error: result?.success === true ? null : (result?.error || null),
          writePhaseTimingMs: this.buildWritePhaseTimingPayload(
            phaseTimings,
            durationMs,
            entryBuildMs,
          ),
        });
      } catch (_metricsErr) {
        // Metrics logging must not propagate to callers
      }
      this._attachCdcConfirmation(result, operation, options);
      return result;
    }

    // If we're not the leader, forward to leader
    if (this.leaderId && this.transport) {
      const phaseTimings = {};
      const forwardDeliverStartMs = Date.now();
      try {
        const leaderAddress = this.resolveLeaderAddress();
        if (!leaderAddress) {
          throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
        }
        const result = await this.transport.deliver(leaderAddress, {
          type: PARTITION_SERVICE_MESSAGE_TYPE.FORWARD_WRITE,
          operation: entry,
          operationId: correlation.operationId,
          requestId: correlation.requestId,
          correlationId: correlation.correlationId,
        });
        this.recordWritePhaseDuration(
          phaseTimings,
          WRITE_PHASE_FIELD_FORWARD_DELIVER_MS,
          forwardDeliverStartMs,
        );
        const durationMs = Date.now() - proposeStartMs;
        try {
          this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, {
            partitionId: this.partitionId,
            durationMs,
            isLeader: false,
            forwarded: true,
            operationId: correlation.operationId,
            requestId: correlation.requestId,
            correlationId: correlation.correlationId,
            acknowledged: result?.acknowledged === true,
            error: result?.acknowledged === true ? null : (result?.error || null),
            writePhaseTimingMs: this.buildWritePhaseTimingPayload(
              phaseTimings,
              durationMs,
              entryBuildMs,
            ),
          });
        } catch (_metricsErr) {
          // Metrics logging must not propagate to callers
        }
        this._attachCdcConfirmation(result, operation, options);
        return result;
      } catch (error) {
        this.recordWritePhaseDuration(
          phaseTimings,
          WRITE_PHASE_FIELD_FORWARD_DELIVER_MS,
          forwardDeliverStartMs,
        );
        const durationMs = Date.now() - proposeStartMs;
        try {
          this.logger.info(METRICS_LOG_TAG.PARTITION_RAFT_PROPOSE, {
            partitionId: this.partitionId,
            durationMs,
            isLeader: false,
            forwarded: true,
            operationId: correlation.operationId,
            requestId: correlation.requestId,
            correlationId: correlation.correlationId,
            acknowledged: false,
            error: error?.message || null,
            writePhaseTimingMs: this.buildWritePhaseTimingPayload(
              phaseTimings,
              durationMs,
              entryBuildMs,
            ),
          });
        } catch (_metricsErr) {
          // Metrics logging must not propagate to callers
        }
        throw new Error(
          PARTITION_SERVICE_ERROR_MSG.forwardWriteFailed(
            error.message,
          ),
        );
      }
    }

    throw new Error(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  }

  /**
   * Attach a CDC confirmation promise to the write result when the
   * caller requested awaitable CDC confirmation.
   *
   * @param {Object} result - Write result to augment.
   * @param {Object} operation - Write operation with tableName and data.
   * @param {Object} [options] - Write options.
   * @private
   */
  _attachCdcConfirmation(result, operation, options) {
    if (!options?.awaitCDCConfirmation || !this.cdcConfirmationTracker) {
      return;
    }
    const tableName = operation.tableName || this.tableName;
    const pkField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
    // For UPDATE/DELETE the primary key lives in whereClause, not data.
    const whereClause = operation.whereClause || {};
    const data = operation.data || {};
    const pkValue = whereClause[pkField] ?? data[pkField];
    if (pkValue !== undefined && pkValue !== null) {
      result.cdcConfirmation =
        this.cdcConfirmationTracker.awaitConfirmation(tableName, pkValue);
    }
  }

  /**
   * Apply a write operation (leader only).
   * @param {Object} entry - Write entry.
   * @param {Object|null} phaseTimings - Optional phase timing collector.
   * @return {Promise<Object>} Operation result.
   * @private
   */
  async applyWrite(entry, phaseTimings = null) {
    const applyStartMs = Date.now();
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.APPLY_WRITE_CALLED, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      tableName: this.tableName,
      isLeader: this.isLeader,
      cdcSubscribers: this.cdcSubscribers.size,
      entryType: entry.type,
    });

    const entryKey = this.getCommittedEntryKey(entry);

    // Append to Raft log
    const logAppendStartMs = Date.now();
    const logEntry = this.storage.appendEntry(entry);
    this.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_LOG_APPEND_MS,
      logAppendStartMs,
    );

    // Execute the SQL
    let result;
    const sqliteRunStartMs = Date.now();
    try {
      if (entry.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE) {
        this.registerMigrationDefaultFromAlterSql(entry.sql);
      }
      const stmt = this.db.prepare(entry.sql);
      const info = stmt.run(...(entry.params || []));
      this.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_SQLITE_RUN_MS,
        sqliteRunStartMs,
      );

      result = {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
        logIndex: logEntry.index,
      };

      // The owner has already applied this write locally. Track the replay
      // key now so the later committed-entry callback does not emit duplicate
      // CDC for the same mutation.
      this.trackAppliedEntryKey(entryKey);

      // Generate CDC event asynchronously to avoid blocking write acknowledgments.
      this.generateCDCEvent({...entry, changes: info.changes}).catch((error) => {
        this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_EVENT_FAILED, {
          partitionId: this.partitionId,
          error: error.message,
        });
      });

      await this.handleSplitReplicationAfterWrite({
        ...entry,
        changes: info.changes,
      });

      if (entry.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE) {
        this.logger.info(PARTITION_SERVICE_LOG_MSG.MIGRATION_ALTER_TABLE_APPLIED, {
          partitionId: this.partitionId,
          tableName: this.tableName,
          migrationId: entry.migrationId || null,
        });
      }

      // Schedule size update
      this.scheduleSizeUpdate();
    } catch (error) {
      this.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_SQLITE_RUN_MS,
        sqliteRunStartMs,
      );
      result = {
        success: false,
        error: error.message,
        partitionId: this.partitionId,
      };
    }

    // Replicate to followers via liferaft
    // liferaft handles replication through its heartbeat mechanism
    // Only use liferaft's command if it considers itself the leader
    // For single-replica groups, liferaft may not be in LEADER state
    // Requirements: 11.9
    const isLiferaftLeader = this.raft && this.raft.state === LifeRaft.LEADER;
    if (isLiferaftLeader) {
      const raftCommandDispatchStartMs = Date.now();
      this.raftProvider.propose(this.raft, entry, (err) => {
        if (err) {
          this.logger.debug(PARTITION_SERVICE_ERROR_MSG.RAFT_COMMAND_FAILED, {
            partitionId: this.partitionId,
            error: err.message,
          });
        }
      });
      this.recordWritePhaseDuration(
        phaseTimings,
        WRITE_PHASE_FIELD_RAFT_COMMAND_DISPATCH_MS,
        raftCommandDispatchStartMs,
      );
    }
    this.recordWritePhaseDuration(
      phaseTimings,
      WRITE_PHASE_FIELD_APPLY_WRITE_MS,
      applyStartMs,
    );

    return result;
  }

  /**
   * Generate a CDC event for a write operation.
   * @param {Object} entry - Write entry.
   * @return {Promise<void>}
   * @private
   */
  async generateCDCEvent(entry) {
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATE_CDC_EVENT_CALLED, {
      partitionId: this.partitionId,
      entryType: entry.type,
      sql: entry.sql ?
        entry.sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT) :
        null,
      subscriberCount: this.cdcSubscribers.size,
    });

    let operation;
    let entryType = entry.type;

    // For raw SQL queries, determine operation type from SQL
    if (entryType === PARTITION_SERVICE_OPERATION.QUERY && entry.sql) {
      const sqlUpper = entry.sql.trim().toUpperCase();
      if (sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO.toUpperCase())) {
        entryType = PARTITION_SERVICE_OPERATION.UPSERT;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.INSERT)) {
        entryType = PARTITION_SERVICE_OPERATION.INSERT;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.UPDATE)) {
        entryType = PARTITION_SERVICE_OPERATION.UPDATE;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.DELETE)) {
        entryType = PARTITION_SERVICE_OPERATION.DELETE;
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.DETECTED_OPERATION_TYPE, {
        originalType: entry.type,
        detectedType: entryType,
      });
    }

    const hasChangeCount = typeof entry.changes === 'number';
    const isNoOpWrite = hasChangeCount && entry.changes <= NUM.ZERO &&
      (entryType === PARTITION_SERVICE_OPERATION.UPDATE ||
      entryType === PARTITION_SERVICE_OPERATION.DELETE ||
      entryType === PARTITION_SERVICE_OPERATION.UPSERT ||
      entryType === PARTITION_SERVICE_OPERATION.QUERY);
    if (isNoOpWrite) {
      this.logger.debug('Suppressing CDC event for no-op write', {
        partitionId: this.partitionId,
        entryType,
        changes: entry.changes,
      });
      return;
    }

    switch (entryType) {
    case PARTITION_SERVICE_OPERATION.INSERT:
      operation = CDCOperation.INSERT;
      break;
    case PARTITION_SERVICE_OPERATION.UPDATE:
      operation = CDCOperation.UPDATE;
      break;
    case PARTITION_SERVICE_OPERATION.UPSERT:
      operation = CDCOperation.UPSERT;
      break;
    case PARTITION_SERVICE_OPERATION.DELETE:
      operation = CDCOperation.DELETE;
      break;
    default:
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_UNKNOWN_OPERATION, {
        entryType,
        partitionId: this.partitionId,
      });
      return; // No CDC for other operations
    }

    // For raw SQL queries, extract table name and data from SQL
    let tableName = entry.tableName || this.tableName;
    if (entry.type === PARTITION_SERVICE_OPERATION.QUERY && entry.sql) {
      // Extract table name from SQL
      const tableMatch = entry.sql.match(
        /(?:UPDATE|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i,
      );
      if (tableMatch) {
        tableName = tableMatch[NUM.ONE];
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_TABLE_NAME, {tableName});
      }
    }

    if (this.cdcSubscribers.size === NUM.ZERO &&
      !this.shouldBufferCdcWithoutSubscribers(tableName)) {
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.NO_CDC_SUBSCRIBERS, {
        partitionId: this.partitionId,
        tableName,
      });
      return;
    }

    // For UPDATE operations, merge whereClause (contains primary key) with data
    // This ensures CDC events always include the primary key field
    // For DELETE operations, use whereClause as the data (contains primary key)
    let cdcData = entry.data || {};
    if ((entry.type === PARTITION_SERVICE_OPERATION.UPDATE ||
      entryType === PARTITION_SERVICE_OPERATION.UPDATE) && entry.whereClause) {
      cdcData = {...entry.whereClause, ...cdcData};
    } else if ((entry.type === PARTITION_SERVICE_OPERATION.DELETE ||
      entryType === PARTITION_SERVICE_OPERATION.DELETE) && entry.whereClause) {
      cdcData = {...entry.whereClause};
    }

    if (entry.type === PARTITION_SERVICE_OPERATION.QUERY && entry.sql) {
      // For parameterized queries (SQL with ? placeholders), build data from params
      const hasParams = entry.params && entry.params.length > NUM.ZERO;
      const hasPlaceholders = entry.sql.includes(
        PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK,
      );

      if (hasParams && hasPlaceholders && Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractDataFromParameterizedSQL(
          entry.sql, entry.params, tableName, entryType,
        );
      }

      // For INSERT queries without params, parse literal values from SQL
      if ((entryType === PARTITION_SERVICE_OPERATION.INSERT ||
        entryType === PARTITION_SERVICE_OPERATION.UPSERT) &&
          Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractInsertDataFromSQL(entry.sql, tableName);
      }

      // For UPDATE queries, try to extract the WHERE clause to query updated row
      if (entryType === PARTITION_SERVICE_OPERATION.UPDATE &&
        Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractUpdateDataFromSQL(entry.sql, tableName);
      }

      // For DELETE queries, extract the WHERE clause
      if (entryType === PARTITION_SERVICE_OPERATION.DELETE &&
        Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractDeleteDataFromSQL(entry.sql);
      }
    }

    const cdcEvent = {
      tableName,
      operation,
      data: cdcData,
      timestamp: entry.timestamp,
      sourcePartition: this.partitionId,
      sourceReplica: this.replicaId,
      sequenceNumber: this.nextCDCEventSequenceNumber(),
    };
    this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_GENERATED);

    // Preserve event order after a transient delivery failure by queuing
    // newly generated events behind the buffered backlog.
    if (this.cdcSubscribers.size > NUM.ZERO && this.cdcEventBuffer.hasEvents()) {
      this.bufferCDCEventForRetry(cdcEvent, 'buffered_backlog_present');
      return;
    }

    // Buffer the event when no subscribers are registered
    if (this.cdcSubscribers.size === NUM.ZERO) {
      if (!this.shouldBufferCdcWithoutSubscribers(tableName)) {
        return;
      }
      const buffered = this.cdcEventBuffer.buffer(cdcEvent);
      if (buffered) {
        this.cdcPipelineMetrics.increment(
          CDC_PIPELINE_METRIC.EVENTS_BUFFERED,
        );
        this.logger.warn(CDC_LIFECYCLE_LOG_MSG.EVENT_BUFFERED, {
          tableName,
          operation,
          partitionId: this.partitionId,
        });
      } else {
        this.cdcPipelineMetrics.increment(
          CDC_PIPELINE_METRIC.EVENTS_DROPPED,
        );
        this.logger.warn(CDC_LIFECYCLE_LOG_MSG.NO_SUBSCRIBERS_NO_BUFFER, {
          tableName,
          operation,
          partitionId: this.partitionId,
        });
      }
      return;
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATED_CDC_EVENT, {
      partitionId: this.partitionId,
      operation,
      tableName: cdcEvent.tableName,
      dataKeys: Object.keys(cdcData),
      subscriberCount: this.cdcSubscribers.size,
    });

    // Deliver to subscribers — snapshot the set to avoid delivering
    // to subscribers added concurrently during async delivery.
    const subscriberSnapshot = [...this.cdcSubscribers];
    let deliveredCount = NUM.ZERO;
    let deliveryFailureCount = NUM.ZERO;
    for (const subscriber of subscriberSnapshot) {
      try {
        await this.deliverCDCEventToSubscriber(subscriber, cdcEvent);
        deliveredCount++;
      } catch (error) {
        deliveryFailureCount++;
        this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.DELIVERY_FAILURES);
        this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_DELIVERY_FAILED, {
          partitionId: this.partitionId,
          tableName: cdcEvent.tableName,
          operation: cdcEvent.operation,
          error: error.message,
        });
      }
    }

    if (deliveryFailureCount > NUM.ZERO) {
      this.bufferCDCEventForRetry(cdcEvent, 'subscriber_delivery_failed');
      return;
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_DELIVERY_COMPLETE, {
      partitionId: this.partitionId,
      deliveredCount,
      subscriberCount: this.cdcSubscribers.size,
    });

    this.cdcPipelineMetrics.increment(CDC_PIPELINE_METRIC.EVENTS_DELIVERED);
    this.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, cdcEvent);
  }

  /**
   * Build a stable key for identifying a committed write entry replay.
   * @param {Object} command - Write command.
   * @return {string|null} Stable key or null when unavailable.
   * @private
   */
  getCommittedEntryKey(command) {
    if (!command || !command.sql) {
      return null;
    }
    if (command.entryId) {
      return `entry:${command.entryId}`;
    }
    const params = Array.isArray(command.params) ?
      JSON.stringify(command.params) :
      STRING.EMPTY;
    return [
      command.proposedBy || STRING.EMPTY,
      String(command.proposedAt || NUM.ZERO),
      command.timestamp || STRING.EMPTY,
      command.sql,
      params,
    ].join('|');
  }

  /**
   * Treat duplicate-key INSERT failures as idempotent replay.
   * Raft recovery can reapply previously-committed INSERT entries after restart.
   * @param {*} error
   * @param {Object} command
   * @return {boolean}
   * @private
   */
  isIdempotentInsertReplayConstraint(error, command) {
    if (!error || !command?.sql) {
      return false;
    }
    const sqlUpper = String(command.sql).trim().toUpperCase();
    const isInsertStatement = sqlUpper.startsWith(SQL.INSERT_INTO) ||
      sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO) ||
      sqlUpper.startsWith(SQL.INSERT_OR_IGNORE_INTO);
    if (!isInsertStatement) {
      return false;
    }
    const code = String(error.code || '').toUpperCase();
    if (code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return true;
    }
    if (code.startsWith('SQLITE_CONSTRAINT')) {
      const message = String(error.message || '');
      if (message.toUpperCase().includes('UNIQUE CONSTRAINT FAILED')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Track an applied write key with bounded history for replay dedupe.
   * @param {string|null} entryKey - Stable write key.
   * @private
   */
  trackAppliedEntryKey(entryKey) {
    if (!entryKey || this.recentlyAppliedEntryKeys.has(entryKey)) {
      return;
    }
    this.recentlyAppliedEntryKeys.add(entryKey);
    this.recentlyAppliedEntryOrder.push(entryKey);

    if (this.recentlyAppliedEntryOrder.length > this.maxTrackedAppliedEntries) {
      const oldestKey = this.recentlyAppliedEntryOrder.shift();
      if (oldestKey) {
        this.recentlyAppliedEntryKeys.delete(oldestKey);
      }
    }
  }

  /**
   * Extract data from INSERT SQL by querying the inserted row.
   * Delegates to partition-sql-parser.js.
   * @param {string} sql - INSERT SQL statement.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractInsertDataFromSQL(sql, tableName) {
    return extractInsertDataFromSQLImpl(
      sql, tableName, this.db, this.logger,
    );
  }

  /**
   * Extract data from UPDATE SQL by querying the updated row.
   * Delegates to partition-sql-parser.js.
   * @param {string} sql - UPDATE SQL statement.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractUpdateDataFromSQL(sql, tableName) {
    return extractUpdateDataFromSQLImpl(
      sql, tableName, this.db, this.logger,
    );
  }

  /**
   * Extract data from DELETE SQL.
   * Delegates to partition-sql-parser.js.
   * @param {string} sql - DELETE SQL statement.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractDeleteDataFromSQL(sql) {
    return extractDeleteDataFromSQLImpl(sql, this.logger);
  }

  /**
   * Extract data from parameterized SQL.
   * Delegates to partition-sql-parser.js.
   * @param {string} sql - SQL statement with ? placeholders.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @param {string} operationType - INSERT, UPDATE, or DELETE.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractDataFromParameterizedSQL(sql, params, tableName, operationType) {
    return extractDataFromParameterizedSQLImpl(
      sql, params, tableName, operationType, this.logger,
    );
  }

  /**
   * Parse values from SQL VALUES clause.
   * Delegates to partition-sql-parser.js.
   * @param {string} valuesStr - Values string.
   * @return {Array} Parsed values.
   * @private
   */
  parseValuesFromSQL(valuesStr) {
    return parseValuesFromSQLImpl(valuesStr);
  }

  /**
   * Parse a single value from SQL.
   * Delegates to partition-sql-parser.js.
   * @param {string} val - Value string.
   * @return {*} Parsed value.
   * @private
   */
  parseValue(val) {
    return parseValueImpl(val);
  }

  /**
   * Resolve whether late-subscriber external CDC is enabled for a table.
   * Control-plane propagation tables remain driven by the canonical CDC
   * policy matrix; user tables may override external CDC via tables.table_policies.
   * @param {string} tableName - Table name.
   * @return {boolean} True when external CDC buffering should remain enabled.
   * @private
   */
  /**
   * Resolve whether late-subscriber external CDC is enabled for a table.
   * Delegates to partition-cdc-delivery.js.
   * @param {string} tableName - Table name.
   * @return {boolean} True when external CDC buffering should remain enabled.
   * @private
   */
  isExternalCdcAllowedForTable(tableName) {
    return this.cdcDelivery.isExternalCdcAllowedForTable(tableName);
  }

  /**
   * Determine whether CDC events should be buffered when there are no
   * subscribers yet. Delegates to partition-cdc-delivery.js.
   * @param {string} tableName - Table name.
   * @return {boolean} True when buffering should stay enabled.
   * @private
   */
  shouldBufferCdcWithoutSubscribers(tableName) {
    return this.cdcDelivery.shouldBufferCdcWithoutSubscribers(tableName);
  }

  /**
   * Allocate next CDC event sequence number.
   * Delegates to partition-cdc-delivery.js.
   * @return {number} Monotonic sequence number.
   * @private
   */
  nextCDCEventSequenceNumber() {
    return this.cdcDelivery.nextCDCEventSequenceNumber();
  }

  /**
   * Buffer one CDC event for retry and schedule replay when possible.
   * Delegates to partition-cdc-delivery.js.
   * @param {Object} cdcEvent - Event payload.
   * @param {string} reason - Buffering reason.
   * @return {boolean} True when buffered, false when dropped.
   * @private
   */
  bufferCDCEventForRetry(cdcEvent, reason) {
    return this.cdcDelivery.bufferCDCEventForRetry(cdcEvent, reason);
  }

  /**
   * Schedule buffered CDC replay with bounded backoff.
   * Delegates to partition-cdc-delivery.js.
   * @param {string} reason - Trigger reason.
   * @private
   */
  scheduleBufferedCDCReplay(reason) {
    this.cdcDelivery.scheduleBufferedCDCReplay(reason);
  }

  /**
   * Replay buffered CDC events to current subscribers.
   * Delegates to partition-cdc-delivery.js.
   * @param {string} reason - Trigger reason.
   * @return {Promise<void>}
   * @private
   */
  async flushBufferedCDCEvents(reason) {
    return this.cdcDelivery.flushBufferedCDCEvents(reason);
  }

  /**
   * Resolve a stable subscriber identifier.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Subscriber.
   * @param {Object} options - Subscription options.
   * @return {string} Stable subscriber identifier.
   * @private
   */
  resolveCDCSubscriberId(subscriber, options = {}) {
    return this.cdcDelivery.resolveCDCSubscriberId(subscriber, options);
  }

  /**
   * Deliver one CDC event to a subscriber callback/object.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Subscriber callback/object.
   * @param {Object} cdcEvent - Event payload.
   * @return {Promise<void>}
   * @private
   */
  async deliverCDCEventToSubscriber(subscriber, cdcEvent) {
    return this.cdcDelivery.deliverCDCEventToSubscriber(
      subscriber, cdcEvent,
    );
  }

  /**
   * Create a wrapper that enriches stream metadata for one subscriber.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Target subscriber.
   * @param {Object} subscriptionState - Mutable state for this subscriber.
   * @return {Function} Wrapper callback.
   * @private
   */
  buildCDCSubscriberWrapper(subscriber, subscriptionState) {
    return this.cdcDelivery.buildCDCSubscriberWrapper(
      subscriber, subscriptionState,
    );
  }

  /**
   * Subscribe to CDC with explicit handshake acknowledgment and catch-up.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Subscriber function or object.
   * @param {Object} [options] - Handshake options.
   * @param {string} [options.subscriberId] - Stable subscriber identifier.
   * @return {Promise<Object>} Handshake acknowledgment.
   */
  async subscribeToCDCWithHandshake(subscriber, options = {}) {
    return this.cdcDelivery.subscribeToCDCWithHandshake(
      subscriber, options,
    );
  }

  /**
   * Subscribe to CDC events from this partition.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Subscriber function or object.
   */
  subscribeToCDC(subscriber) {
    this.cdcDelivery.subscribeToCDC(subscriber);
  }

  /**
   * Unsubscribe from CDC events.
   * Delegates to partition-cdc-delivery.js.
   * @param {Function|Object} subscriber - Subscriber to remove.
   */
  unsubscribeFromCDC(subscriber) {
    this.cdcDelivery.unsubscribeFromCDC(subscriber);
  }

  /**
   * Get CDC subscription diagnostics for this partition.
   * Delegates to partition-cdc-delivery.js.
   * @return {Object} CDC subscription diagnostics.
   */
  getCDCSubscriptionDiagnostics() {
    return this.cdcDelivery.getCDCSubscriptionDiagnostics();
  }


  /**
   * Calculate the partition size using SQLite pragmas.
   * @return {Promise<number>} Size in bytes.
   */
  async calculatePartitionSize() {
    if (!this.db) {
      return NUM.ZERO;
    }

    try {
      const pageCount = this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_PAGE_COUNT, {
        simple: true,
      });
      const pageSize = this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_PAGE_SIZE, {
        simple: true,
      });
      return pageCount * pageSize;
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.PARTITION_SIZE_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      return NUM.ZERO;
    }
  }

  /**
   * Update the partition size and emit event.
   * @return {Promise<void>}
   */
  async updatePartitionSize() {
    try {
      const sizeBytes = await this.calculatePartitionSize();
      this.sizeBytes = sizeBytes;
      this.lastSizeUpdate = Date.now();

      this.logger.debug(PARTITION_SERVICE_LOG_MSG.PARTITION_SIZE_UPDATED, {
        partitionId: this.partitionId,
        sizeBytes,
        sizeMB: (
          sizeBytes / PARTITION_SERVICE_VALUE.SIZE_BYTES_DIVISOR
        ).toFixed(PARTITION_SERVICE_VALUE.SIZE_MB_PRECISION),
      });

      this.emit(PARTITION_SERVICE_EVENT.SIZE_UPDATED, {
        partitionId: this.partitionId,
        sizeBytes,
        timestamp: this.lastSizeUpdate,
      });
      await this.persistPartitionSize(sizeBytes);
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.PARTITION_SIZE_UPDATE_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
    }
  }

  /**
   * Schedule an asynchronous size update (debounced).
   * @private
   */
  scheduleSizeUpdate() {
    if (this.sizeUpdatePending) {
      return;
    }

    const timeSinceLastUpdate = Date.now() - this.lastSizeUpdate;
    if (timeSinceLastUpdate < this.sizeUpdateDebounceMs) {
      return;
    }

    this.sizeUpdatePending = true;

    setImmediate(async () => {
      try {
        await this.updatePartitionSize();
      } finally {
        this.sizeUpdatePending = false;
      }
    });
  }

  /**
   * Start periodic size updates.
   * @private
   */
  startPeriodicSizeUpdates() {
    if (this.sizeUpdateTimer) {
      return;
    }
    if (this.isShutdown) {
      this.logger.debug(
        PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, {
          partitionId: this.partitionId,
          timer: 'sizeUpdateTimer',
        });
      return;
    }

    this.sizeUpdateTimer = setInterval(async () => {
      const timeSinceLastUpdate = Date.now() - this.lastSizeUpdate;
      if (timeSinceLastUpdate >= this.sizeUpdateIntervalMs) {
        await this.updatePartitionSize();
      }
    }, this.sizeUpdateIntervalMs);
    this.sizeUpdateTimer.unref();
  }

  /**
   * Stop periodic size updates.
   * @private
   */
  stopPeriodicSizeUpdates() {
    if (this.sizeUpdateTimer) {
      clearInterval(this.sizeUpdateTimer);
      this.sizeUpdateTimer = null;
    }
  }

  /**
   * Get the current partition size.
   * @return {number} Size in bytes.
   */
  getSize() {
    return this.sizeBytes;
  }

  /**
   * Persist leader-owned size_bytes updates into the partitions system table.
   * @param {number} sizeBytes - Latest measured size.
   * @return {Promise<void>}
   * @private
   */
  async persistPartitionSize(sizeBytes) {
    if (!this.isLeader ||
        !this.systemTableCache ||
        !this.cdcIntegrationService ||
        !this.isPartitionsLeaderAvailable()) {
      return;
    }

    const cachedPartition = this.systemTableCache.get?.(
      TABLES.PARTITIONS,
      this.partitionId,
    ) || null;
    if (!cachedPartition) {
      return;
    }

    const cachedSize = Number(
      cachedPartition.size_bytes ?? cachedPartition.sizeBytes,
    );
    if (Number.isFinite(cachedSize) && cachedSize === sizeBytes) {
      return;
    }

    try {
      const gateway =
        this.rebalancer?.controlPlaneSystemTableGateway ||
        new ControlPlaneSystemTableGateway({
          nodeId: this.nodeId,
          cdcIntegrationService: this.cdcIntegrationService,
          messageRouter: this.transport,
        });
      await gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.PARTITIONS,
        whereClause: {partition_id: this.partitionId},
        data: {
          size_bytes: sizeBytes,
          updated_at: Date.now(),
        },
      }, {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        deliveryPriority: 'background',
        allowPressureDefer: true,
        coalescingKey: `partitions:size:${this.partitionId}`,
      });
    } catch (error) {
      this.logger.warn(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_SIZE_PERSIST_FAILED, {
        partitionId: this.partitionId,
        sizeBytes,
        error: error.message,
      });
    }
  }

  /**
   * Normalize split transition metadata from table/control-plane payloads.
   * @param {Object|string|null} rawMetadata - Metadata payload.
   * @return {Object|null} Normalized metadata.
   * @private
   */
  normalizeSplitTransitionMetadata(rawMetadata) {
    if (!rawMetadata) {
      return null;
    }
    let metadata = rawMetadata;
    if (typeof rawMetadata === 'string') {
      try {
        metadata = JSON.parse(rawMetadata);
      } catch {
        return null;
      }
    }
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }
    const targetPartitionIds =
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS];
    const targetPartitionVersion = Number(
      metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION],
    );
    const primaryKeyColumn =
      metadata[PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN];
    const sourcePartitionId =
      metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID];
    if (!primaryKeyColumn ||
        !sourcePartitionId ||
        sourcePartitionId !== this.partitionId ||
        !Array.isArray(targetPartitionIds) ||
        targetPartitionIds.length !== NUM.TWO ||
        !targetPartitionIds[0] ||
        !targetPartitionIds[1] ||
        !Number.isInteger(targetPartitionVersion)) {
      return null;
    }
    return {
      primaryKeyColumn,
      sourcePartitionId,
      splitKey: metadata[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY],
      targetPartitionIds: [...targetPartitionIds],
      targetPartitionVersion,
      workflowId:
        metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || null,
    };
  }

  /**
   * Determine whether two split-replication descriptors refer to the same split.
   * @param {Object|null} left - Existing metadata.
   * @param {Object|null} right - Incoming metadata.
   * @return {boolean} True when both describe the same split.
   * @private
   */
  isSameSplitReplication(left, right) {
    if (!left || !right) {
      return false;
    }
    return left.primaryKeyColumn === right.primaryKeyColumn &&
      left.sourcePartitionId === right.sourcePartitionId &&
      left.splitKey === right.splitKey &&
      left.targetPartitionVersion === right.targetPartitionVersion &&
      Array.isArray(left.targetPartitionIds) &&
      Array.isArray(right.targetPartitionIds) &&
      left.targetPartitionIds.length === right.targetPartitionIds.length &&
      left.targetPartitionIds.every((partitionId, index) =>
        partitionId === right.targetPartitionIds[index],
      );
  }

  /**
   * Reconstruct the transient split execution handle from durable
   * workflow state after a process restart.
   *
   * The canonical split phase and participant state are owned by
   * ManagedSplitWorkflow via DurableWorkflowCoordinator. This method
   * rebuilds the local execution context so that
   * handleSplitReplicationAfterWrite can route writes correctly while
   * the workflow resumes.
   *
   * @param {Object} durableState - Durable workflow state.
   * @param {string} durableState.phase - Canonical workflow phase from
   *   PARTITION_TRANSITION_STATE.
   * @param {Object} durableState.metadata - Normalized split
   *   transition metadata (recoverable from the tables row).
   * @return {Object|null} Reconstructed transient execution handle,
   *   or null if the durable state is not an active split.
   */
  reconstructSplitExecutionState(durableState) {
    if (!durableState || !durableState.phase || !durableState.metadata) {
      return null;
    }
    const phase = durableState.phase;
    const activeSplitPhases = new Set([
      PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    ]);
    if (!activeSplitPhases.has(phase)) {
      return null;
    }
    const metadata =
      this.normalizeSplitTransitionMetadata(durableState.metadata);
    if (!metadata) {
      return null;
    }
    this.splitReplication = {
      metadata,
      phase,
      pendingEntries: [],
      flushInFlight: false,
      startedAt: Date.now(),
      lastError: null,
    };
    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_RECONSTRUCTED,
      {
        partitionId: this.partitionId,
        phase,
        workflowId: metadata.workflowId,
      },
    );
    return this.splitReplication;
  }

  /**
   * Run snapshot backfill and queued-delta catch-up for the active split.
   * @return {Promise<void>}
   * @private
   */
  async runSplitReplicationWorkflow() {
    const splitReplication = this.splitReplication;
    const metadata = splitReplication?.metadata || null;
    if (!metadata) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      );
    }

    this.logger.info(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_STARTED, {
      partitionId: this.partitionId,
      targetPartitionIds: metadata.targetPartitionIds,
      targetPartitionVersion: metadata.targetPartitionVersion,
    });

    await this.emitSplitSourceAck(metadata, SPLIT_ACK_STATUS.SNAPSHOT_STARTED);

    const snapshot = this.openSplitSnapshotDatabase();
    try {
      await this.backfillSplitSnapshot(snapshot, metadata);
      splitReplication.phase = PARTITION_TRANSITION_STATE.SPLIT_CATCHUP;

      await this.emitSplitSourceAck(
        metadata,
        SPLIT_ACK_STATUS.CATCHUP_READY,
      );

      await this.flushSplitReplicationQueue();
      await this.markSplitCutoverActive(metadata);
      splitReplication.phase = PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE;
      await this.flushSplitReplicationQueue();

      await this.emitSplitSourceAck(
        metadata,
        SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
        {
          [SPLIT_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED]: false,
        },
      );

      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_COMPLETED,
        {
          partitionId: this.partitionId,
          targetPartitionIds: metadata.targetPartitionIds,
          targetPartitionVersion: metadata.targetPartitionVersion,
        },
      );
    } finally {
      snapshot?.close?.();
    }
  }

  /**
   * Emit a typed source-side split acknowledgement to the workflow owner.
   *
   * Builds a canonical PARTICIPANT_ACK_FIELD payload and routes it
   * through ManagedSplitWorkflow.acknowledgeSourceParticipant so the
   * durable workflow coordinator persists participant state.
   *
   * @param {Object} metadata - Normalized split transition metadata.
   * @param {string} ackStatus - SPLIT_ACK_STATUS value.
   * @param {Object} [checkpoint] - Optional checkpoint data.
   * @return {Promise<Object>} Acknowledgement result.
   * @private
   */
  async emitSplitSourceAck(metadata, ackStatus, checkpoint) {
    const splitWorkflow = this.sqlQueryEngine?.managedSplitWorkflow;
    if (!splitWorkflow ||
        typeof splitWorkflow.acknowledgeSourceParticipant !==
          PARTITION_SERVICE_TYPE.FUNCTION) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      );
    }

    const workflowId = metadata.workflowId;
    if (!workflowId) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      );
    }

    const ack = {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.STATUS]: ackStatus,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: Date.now(),
    };

    if (checkpoint) {
      ack[PARTICIPANT_ACK_FIELD.CHECKPOINT] = checkpoint;
    }

    const result = await splitWorkflow.acknowledgeSourceParticipant(
      workflowId,
      ack,
    );

    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_ACK_EMITTED,
      {
        partitionId: this.partitionId,
        workflowId,
        ackStatus,
        result: result?.result,
      },
    );

    return result;
  }

  /**
   * Open a snapshot reader pinned to the current source-partition state.
   * Falls back to the live connection for in-memory test databases.
   * @return {Database|Object} Snapshot database handle.
   * @private
   */
  openSplitSnapshotDatabase() {
    if (!this.dbPath ||
        this.dbPath === PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH) {
      return {
        prepare: (...args) => this.db.prepare(...args),
        close() {},
      };
    }

    const snapshotDb = new Database(this.dbPath, {
      readonly: true,
      fileMustExist: true,
    });
    snapshotDb.exec('BEGIN');
    return snapshotDb;
  }

  /**
   * Yield one event-loop turn during source snapshot backfill so a split does
   * not monopolize unrelated partitions on the same node.
   * @return {Promise<void>}
   * @private
   */
  async yieldSplitBackfillTurn() {
    await new Promise((resolve) => {
      if (typeof setImmediate === 'function') {
        setImmediate(resolve);
        return;
      }
      setTimeout(resolve, NUM.ZERO);
    });
  }

  /**
   * Create a row iterator for split snapshot backfill.
   * Prefer iterate() so large source snapshots are streamed.
   * @param {Database|Object} snapshotDb - Snapshot handle.
   * @param {Object} metadata - Normalized split metadata.
   * @return {Iterable<Object>}
   * @private
   */
  createSplitSnapshotRowIterator(snapshotDb, metadata) {
    const sql = `SELECT * FROM ${this.tableName} ` +
      `ORDER BY ${metadata.primaryKeyColumn}`;
    const statement = snapshotDb.prepare(sql);
    if (statement && typeof statement.iterate === 'function') {
      return statement.iterate();
    }
    if (statement && typeof statement.all === 'function') {
      return statement.all();
    }
    return [];
  }

  /**
   * Copy the source snapshot into child partitions using idempotent upserts.
   * @param {Database|Object} snapshotDb - Snapshot handle.
   * @param {Object} metadata - Normalized split metadata.
   * @return {Promise<void>}
   * @private
   */
  async backfillSplitSnapshot(snapshotDb, metadata) {
    const columns = snapshotDb.prepare(`PRAGMA table_info(${this.tableName})`).all()
      .map((column) => column.name);
    const rows = this.createSplitSnapshotRowIterator(snapshotDb, metadata);
    let processedRowCount = NUM.ZERO;

    for (const row of rows) {
      await this.applySplitSnapshotRow(row, columns, metadata);
      processedRowCount += NUM.ONE;
      if (
        this.splitSnapshotBackfillYieldEveryRows > NUM.ZERO &&
        processedRowCount % this.splitSnapshotBackfillYieldEveryRows === NUM.ZERO
      ) {
        await this.yieldSplitBackfillTurn();
      }
    }
  }

  /**
   * Apply one snapshot row to the correct child partition.
   * @param {Object} row - Source row.
   * @param {Array<string>} columns - Column list.
   * @param {Object} metadata - Split metadata.
   * @return {Promise<void>}
   * @private
   */
  async applySplitSnapshotRow(row, columns, metadata) {
    const targetPartitionId = this.resolveSplitTargetPartitionId(
      row?.[metadata.primaryKeyColumn],
      metadata,
    );
    const placeholders = columns
      .map(() => PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const sql = `${SQL.INSERT_OR_REPLACE_INTO} ${this.tableName} ` +
      `(${columns.join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE)}) ` +
      `${SQL.VALUES} (${placeholders})`;
    const params = columns.map((column) => row[column]);
    await this.routeSplitMirroredWrite(targetPartitionId, sql, params);
  }

  /**
   * Update table metadata so routing flips to the new partition version.
   * @param {Object} metadata - Split metadata.
   * @return {Promise<void>}
   * @private
   */
  async markSplitCutoverActive(metadata) {
    const splitWorkflow =
      this.sqlQueryEngine?.managedSplitWorkflow;
    if (!splitWorkflow ||
        typeof splitWorkflow.advanceSplitPhase !== 'function') {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      );
    }

    const workflowId = metadata.workflowId;
    if (!workflowId) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      );
    }

    await splitWorkflow.advanceSplitPhase(
      workflowId,
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      {
        [PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT]:
          Date.now(),
      },
    );

    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_CUTOVER_UPDATED,
      {
        partitionId: this.partitionId,
        tableId: this.tableId,
        targetPartitionVersion: metadata.targetPartitionVersion,
        targetPartitionIds: metadata.targetPartitionIds,
      },
    );
  }

  /**
   * Handle source-partition writes while a split is in progress.
   * Backfilling queues ordered deltas; cutover-active mirrors immediately.
   * @param {Object} entry - Applied source write entry.
   * @return {Promise<void>}
   * @private
   */
  async handleSplitReplicationAfterWrite(entry) {
    const splitReplication = this.splitReplication;
    if (!splitReplication ||
        !splitReplication.metadata ||
        this.partitionId !== splitReplication.metadata.sourcePartitionId) {
      return;
    }

    if (entry.splitMirrorOrigin === PARTITION_SPLIT_MIRROR_ORIGIN.TARGET) {
      return;
    }

    if (splitReplication.phase === PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING ||
        splitReplication.phase === PARTITION_TRANSITION_STATE.SPLIT_CATCHUP) {
      splitReplication.pendingEntries.push(this.cloneSplitEntry(entry));
      return;
    }

    if (splitReplication.phase !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE) {
      return;
    }

    try {
      await this.replaySplitEntry(entry, splitReplication.metadata);
    } catch (error) {
      splitReplication.pendingEntries.push(this.cloneSplitEntry(entry));
      splitReplication.lastError = error.message;
      this.logger.warn(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_MIRROR_FAILED, {
        partitionId: this.partitionId,
        error: error.message,
      });
      this.flushSplitReplicationQueue().catch((flushError) => {
        splitReplication.lastError = flushError.message;
        this.logger.warn(PARTITION_SERVICE_LOG_MSG.SPLIT_REPLICATION_MIRROR_FAILED, {
          partitionId: this.partitionId,
          error: flushError.message,
        });
      });
    }
  }

  /**
   * Flush queued post-snapshot deltas in source order.
   * @return {Promise<void>}
   * @private
   */
  async flushSplitReplicationQueue() {
    const splitReplication = this.splitReplication;
    if (!splitReplication || splitReplication.flushInFlight) {
      return;
    }

    splitReplication.flushInFlight = true;
    try {
      while (splitReplication.pendingEntries.length > NUM.ZERO) {
        const entry = splitReplication.pendingEntries.shift();
        try {
          await this.replaySplitEntry(entry, splitReplication.metadata);
        } catch (error) {
          splitReplication.pendingEntries.unshift(entry);
          throw error;
        }
      }
    } finally {
      splitReplication.flushInFlight = false;
    }
  }

  /**
   * Clone a write entry before placing it in the split catch-up queue.
   * @param {Object} entry - Applied write entry.
   * @return {Object} Safe queued copy.
   * @private
   */
  cloneSplitEntry(entry) {
    return {
      ...entry,
      params: Array.isArray(entry?.params) ? [...entry.params] : [],
      data: entry?.data && typeof entry.data === 'object' ? {...entry.data} : entry?.data,
      whereClause: entry?.whereClause && typeof entry.whereClause === 'object' ?
        {...entry.whereClause} :
        entry?.whereClause,
    };
  }

  /**
   * Replay one queued source write against the correct child partition.
   * @param {Object} entry - Applied source write entry.
   * @param {Object} metadata - Split metadata.
   * @return {Promise<void>}
   * @private
   */
  async replaySplitEntry(entry, metadata) {
    const routingKey = this.extractSplitRoutingKey(entry, metadata.primaryKeyColumn);
    const targetPartitionId = this.resolveSplitTargetPartitionId(routingKey, metadata);
    await this.routeSplitMirroredWrite(
      targetPartitionId,
      entry.sql,
      entry.params || [],
    );
  }

  /**
   * Route one mirrored write through the standard partition query path.
   * @param {string} partitionId - Child partition ID.
   * @param {string} sql - SQL statement.
   * @param {Array} params - Statement parameters.
   * @return {Promise<void>}
   * @private
   */
  async routeSplitMirroredWrite(partitionId, sql, params) {
    const queryExecutor = this.sqlQueryEngine?.queryExecutor || null;
    if (!queryExecutor ||
        typeof queryExecutor.executeOnPartition !== PARTITION_SERVICE_TYPE.FUNCTION) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
    }

    const result = await queryExecutor.executeOnPartition(
      partitionId,
      sql,
      params,
      false,
      true,
      false,
      {splitMirrorOrigin: PARTITION_SPLIT_MIRROR_ORIGIN.SOURCE},
    );

    if (!result?.success) {
      throw new Error(
        result?.error || PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED,
      );
    }
  }

  /**
   * Resolve the child partition ID for one partition-key value.
   * @param {*} value - Primary-key value.
   * @param {Object} metadata - Split metadata.
   * @return {string} Target child partition ID.
   * @private
   */
  resolveSplitTargetPartitionId(value, metadata) {
    const [leftPartitionId, rightPartitionId] = metadata.targetPartitionIds;
    if (value === null || value === undefined) {
      return rightPartitionId;
    }
    return value < metadata.splitKey ? leftPartitionId : rightPartitionId;
  }

  /**
   * Extract the partition routing key from an applied write entry.
   * @param {Object} entry - Applied source write entry.
   * @param {string} primaryKeyColumn - Partition key column.
   * @return {*} Routing key.
   * @private
   */
  extractSplitRoutingKey(entry, primaryKeyColumn) {
    if (entry?.whereClause &&
        Object.prototype.hasOwnProperty.call(entry.whereClause, primaryKeyColumn)) {
      return entry.whereClause[primaryKeyColumn];
    }
    if (entry?.data &&
        Object.prototype.hasOwnProperty.call(entry.data, primaryKeyColumn)) {
      return entry.data[primaryKeyColumn];
    }

    let operationType = entry?.type || PARTITION_SERVICE_OPERATION.QUERY;
    if (operationType === PARTITION_SERVICE_OPERATION.QUERY && entry?.sql) {
      const sqlUpper = entry.sql.trim().toUpperCase();
      if (sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO.toUpperCase())) {
        operationType = PARTITION_SERVICE_OPERATION.UPSERT;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.INSERT)) {
        operationType = PARTITION_SERVICE_OPERATION.INSERT;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.UPDATE)) {
        operationType = PARTITION_SERVICE_OPERATION.UPDATE;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.DELETE)) {
        operationType = PARTITION_SERVICE_OPERATION.DELETE;
      }
    }

    let extracted = {};
    if (entry?.sql) {
      const params = Array.isArray(entry.params) ? entry.params : [];
      if (params.length > NUM.ZERO &&
          entry.sql.includes(PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK)) {
        extracted = this.extractDataFromParameterizedSQL(
          entry.sql,
          params,
          this.tableName,
          operationType,
        );
      } else if (operationType === PARTITION_SERVICE_OPERATION.INSERT ||
          operationType === PARTITION_SERVICE_OPERATION.UPSERT) {
        extracted = this.extractInsertDataFromSQL(entry.sql, this.tableName);
      } else if (operationType === PARTITION_SERVICE_OPERATION.UPDATE) {
        extracted = this.extractUpdateDataFromSQL(entry.sql, this.tableName);
      } else if (operationType === PARTITION_SERVICE_OPERATION.DELETE) {
        extracted = this.extractDeleteDataFromSQL(entry.sql);
      }
    }

    const routingKey = extracted?.[primaryKeyColumn];
    if (routingKey === undefined || routingKey === null) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED);
    }
    return routingKey;
  }

  /**
   * Get the partition key range.
   * @return {Object} Key range {start, end}.
   */
  getKeyRange() {
    return {...this.keyRange};
  }

  /**
   * Set the partition key range.
   * @param {Object} keyRange - New key range {start, end}.
   */
  setKeyRange(keyRange) {
    this.keyRange = {...keyRange};
    this.emit(PARTITION_SERVICE_EVENT.KEY_RANGE_CHANGED, {
      partitionId: this.partitionId,
      keyRange: this.keyRange,
    });
  }

  /**
   * Check if a key falls within this partition's range.
   * @param {*} key - Key to check.
   * @return {boolean} True if key is in range.
   */
  isKeyInRange(key) {
    const {start, end} = this.keyRange;

    // NULL start means unbounded lower
    // NULL end means unbounded upper
    if (start === null && end === null) {
      return true;
    }

    if (start === null) {
      return key < end;
    }

    if (end === null) {
      return key >= start;
    }

    return key >= start && key < end;
  }


  /**
   * Check if this replica is the leader.
   * @return {boolean} True if leader.
   */
  isLeaderReplica() {
    return this.role === RaftRole.LEADER;
  }

  /**
   * Get the current leader ID.
   * @return {string|null} Leader replica ID.
   */
  getLeaderId() {
    return this.leaderId;
  }

  /**
   * Get the current Raft role.
   * @return {string} Current role.
   */
  getRole() {
    return this.role;
  }

  /**
   * Get the current term.
   * @return {number} Current term.
   */
  getCurrentTerm() {
    return this.storage?.currentTerm || NUM.ZERO;
  }

  /**
   * Get the partition state.
   * @return {string} Partition state.
   */
  getState() {
    return this.state;
  }

  /**
   * Get service status.
   * @return {Object} Service status.
   */
  getStatus() {
    return {
      partitionId: this.partitionId,
      tableId: this.tableId,
      tableName: this.tableName,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      role: this.role,
      isLeader: this.isLeader,
      leaderId: this.leaderId,
      term: this.storage?.currentTerm || NUM.ZERO,
      logLength: this.storage?.getLogLength() || NUM.ZERO,
      state: this.state,
      keyRange: this.keyRange,
      sizeBytes: this.sizeBytes,
      replicaCount: this.replicaIds.length,
      cdcSubscribers: this.cdcSubscribers.size,
      initialized: this.initialized,
    };
  }

  /**
   * Set the system table cache for the rebalancer.
   * Called after cache hydration is complete.
   * @param {Object} systemTableCache - Read-only system table cache.
   */
  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache;
    if (this.rebalancer) {
      this.rebalancer.systemTableCache = systemTableCache;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.systemTableCache = systemTableCache;
    }
    this.maybeInitializeRebalancer();
  }

  /**
   * Set the CDC integration service for system table writes.
   * Called after cache hydration is complete.
   * Required for rebalancer to delete service rows after REMOVE_REPLICA.
   * @param {Object} cdcIntegrationService - CDC integration service.
   */
  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
    if (this.rebalancer) {
      this.rebalancer.cdcIntegrationService = cdcIntegrationService;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.cdcIntegrationService = cdcIntegrationService;
    }
    this.maybeInitializeRebalancer();
    this.flushRoleUpdate().catch((error) => {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_ROLE_AFTER_CDC_FAILED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        error: error.message,
      });
    });
    this.flushLeaderNodeUpdate().catch((error) => {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.PERSIST_LEADER_AFTER_CDC_FAILED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        error: error.message,
      });
    });
  }

  /**
   * Set table policy service for rebalancing decisions.
   * @param {Object} tablePolicyService - Table policy service instance.
   */
  setTablePolicyService(tablePolicyService) {
    this.tablePolicyService = tablePolicyService;
    if (this.rebalancer) {
      this.rebalancer.tablePolicyService = tablePolicyService;
    }
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.tablePolicyService = tablePolicyService;
    }
    this.maybeInitializeRebalancer();
  }

  /**
   * Set rebalance coordinator for partition rebalancing.
   * Allows partitions to bind to the shared control-plane coordinator.
   * @param {Object} rebalanceCoordinator - Rebalance coordinator.
   */
  setRebalanceCoordinator(rebalanceCoordinator) {
    if (!rebalanceCoordinator) {
      return;
    }

    this.rebindCoordinator(rebalanceCoordinator);
  }

  /**
   * Canonical rebind API for coordinator replacement.
   *
   * This is the single path for updating the coordinator reference,
   * propagating the change to the rebalancer, and emitting a
   * diagnostic log. All coordinator replacement MUST route here.
   *
   * Validates: Requirements 7.2, 7.3
   * Design: D8.2, D8.3
   *
   * @param {Object} newCoordinator - The new coordinator instance.
   */
  rebindCoordinator(newCoordinator) {
    const previousCoordinator = this.rebalanceCoordinator;
    const hadPrevious = !!previousCoordinator;
    const isReplacement = hadPrevious &&
      previousCoordinator !== newCoordinator;
    const shouldShutdownPrevious =
      this.ownsRebalanceCoordinator &&
      isReplacement &&
      typeof previousCoordinator.shutdown ===
        PARTITION_SERVICE_TYPE.FUNCTION;

    this.rebalanceCoordinator = newCoordinator;
    this.ownsRebalanceCoordinator = false;

    if (this.rebalancer) {
      const setCoordinator = assertCritical(
        typeof this.rebalancer.setRebalanceCoordinator ===
            PARTITION_SERVICE_TYPE.FUNCTION ?
          this.rebalancer.setRebalanceCoordinator
            .bind(this.rebalancer) :
          null,
        PARTITION_SERVICE_ERROR_MSG
          .REBALANCER_SET_COORDINATOR_REQUIRED,
      );
      setCoordinator(newCoordinator);
    }

    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.COORDINATOR_REBOUND,
      {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        hadPrevious,
        isReplacement,
      },
    );

    if (shouldShutdownPrevious) {
      previousCoordinator.shutdown().catch((error) => {
        this.logger.warn(
          PARTITION_SERVICE_ERROR_MSG
            .REBALANCE_COORDINATOR_SHUTDOWN_FAILED,
          {
            partitionId: this.partitionId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
      });
    }

    this.maybeInitializeRebalancer();
  }

  /**
   * Set SQL query engine for rebalancer operations.
   * @param {Object} sqlQueryEngine - SQL query engine instance.
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
    if (this.rebalanceCoordinator) {
      this.rebalanceCoordinator.sqlQueryEngine = sqlQueryEngine;
    }
    this.maybeInitializeRebalancer();
  }

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

    if (!systemTableCache ||
        !cdcIntegrationService ||
        !tablePolicyService ||
        !messageRouter ||
        !sqlQueryEngine ||
        !rebalanceCoordinator) {
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
      bundle.rebalanceCoordinator.sqlQueryEngine =
        bundle.sqlQueryEngine;
      if (typeof bundle.rebalanceCoordinator.syncOwnerDependencies ===
          PARTITION_SERVICE_TYPE.FUNCTION) {
        bundle.rebalanceCoordinator.syncOwnerDependencies(bundle);
      }
    }

    if (typeof this.rebalancer.syncOwnerDependencies ===
        PARTITION_SERVICE_TYPE.FUNCTION) {
      this.rebalancer.syncOwnerDependencies(bundle);
      coordinatorRoutedThroughSetter = !!bundle.rebalanceCoordinator;
    } else {
      this.rebalancer.systemTableCache = bundle.systemTableCache;
      this.rebalancer.cdcIntegrationService = bundle.cdcIntegrationService;
      this.rebalancer.tablePolicyService = bundle.tablePolicyService;
      this.rebalancer.messageRouter = bundle.messageRouter;
      this.rebalancer.sqlQueryEngine = bundle.sqlQueryEngine;
      if (this.rebalancer.controlPlaneSystemTableGateway &&
          typeof this.rebalancer.controlPlaneSystemTableGateway
            .setSqlQueryEngine === PARTITION_SERVICE_TYPE.FUNCTION) {
        this.rebalancer.controlPlaneSystemTableGateway
          .setSqlQueryEngine(bundle.sqlQueryEngine);
      }
    }
    if (bundle.rebalanceCoordinator &&
        coordinatorRoutedThroughSetter !== true) {
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
      const bundle = this.buildRebalancerDependencyBundle();
      this.applyRebalancerDependencies(bundle);
      if (typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION) {
        this.rebalancer.setLeader(backgroundReady && this.isLeader);
      }
      return;
    }

    if (!backgroundReady ||
        !this.isLeader) {
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
    if (typeof rebalanceCoordinator.syncOwnerDependencies ===
        PARTITION_SERVICE_TYPE.FUNCTION) {
      rebalanceCoordinator.syncOwnerDependencies({
        systemTableCache,
        cdcIntegrationService,
        tablePolicyService,
        messageRouter,
        sqlQueryEngine,
      });
    }
    if (typeof rebalanceCoordinator.initialize ===
        PARTITION_SERVICE_TYPE.FUNCTION) {
      rebalanceCoordinator.initialize();
    }

    this.rebalancer = new UnifiedRebalancer({
      entityId: this.partitionId,
      entityType: EntityType.PARTITION,
      systemTableCache: systemTableCache,
      cdcIntegrationService: cdcIntegrationService,
      tablePolicyService: tablePolicyService,
      sqlQueryEngine: sqlQueryEngine,
      nodeId: this.nodeId,
      replicaStateMachine: this.replicaStateMachine,
      messageRouter: messageRouter,
      rebalanceCoordinator: rebalanceCoordinator,
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
    return isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.PARTITIONS);
  }

  /**
   * Check if the services table is writable through either cache-visible
   * routing metadata or the local services-p1 leader owner.
   * @return {boolean} True if writes can be issued safely.
   * @private
   */
  isServicesLeaderAvailable() {
    if (isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.SERVICES)) {
      return true;
    }
    return this.cdcIntegrationService?.canWriteSystemTableLocally?.(
      SYSTEM_TABLE_NAME.SERVICES,
    ) === true;
  }

  getMetadataPublicationDeliveryPriority() {
    return CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) ?
      'critical' :
      'background';
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

    // With flat message structure, request_id should be directly on the result
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

    // Track the request with PendingRequestTracker
    const trackPromise = this.pendingRequestTracker.track(requestId, {
      type: message.type,
      targetAddress,
      timeoutMs,
    });

    // Store any rejection that happens during delivery (e.g., from shutdown)
    // This prevents unhandled promise rejection when delivery triggers shutdown
    // on the same node, which clears pending requests before we await trackPromise
    let earlyRejection = null;
    trackPromise.catch((err) => {
      earlyRejection = err;
    });

    try {
      // Send the message via transport
      const result = await transport.deliver(targetAddress, message);

      // Check if the tracker was cleared during delivery (e.g., self-removal)
      if (earlyRejection) {
        // If the error is "Tracker shutdown", this is expected for self-removal
        // The operation was successful - the replica was removed
        if (earlyRejection.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN) {
          this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_DELIVERY, {
            requestId,
            partitionId: this.partitionId,
          });
          // Return a synthetic ACK indicating the operation completed
          return {
            request_id: requestId,
            status: PARTITION_SERVICE_STATUS.INITIATED,
            message: PARTITION_SERVICE_LOG_MSG.REPLICA_REMOVAL_SELF,
          };
        }
        throw earlyRejection;
      }

      // Check if delivery failed (no connection, no handler, etc.)
      // Fail fast instead of waiting for timeout
      if (result && result.acknowledged === false) {
        const errorMsg = result.error || PARTITION_SERVICE_ERROR_MSG.DELIVERY_NOT_ACK;
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.MESSAGE_DELIVERY_FAILED, {
          requestId,
          targetAddress,
          error: errorMsg,
          partitionId: this.partitionId,
        });
        // Clean up the pending request
        if (this.pendingRequestTracker.hasPending(requestId)) {
          this.pendingRequestTracker.reject(
            requestId,
            new Error(`Delivery failed: ${errorMsg}`),
          );
        }
        throw new Error(`Delivery failed: ${errorMsg}`);
      }

      // Extract ACK from response if present (Requirements 6.1, 6.2, 6.3, 6.4)
      const ack = this.extractAckFromResponse(result, requestId);
      if (ack) {
        // Resolve via tracker (clears timeout)
        this.pendingRequestTracker.resolve(requestId, ack);
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.RECEIVED_ACK, {
          requestId,
          status: ack.status,
          partitionId: this.partitionId,
        });
        return ack;
      }

      // Wait for ACK via tracker (will timeout if not received)
      return await trackPromise;
    } catch (error) {
      // Handle "Tracker shutdown" error gracefully for self-removal scenarios
      if (error.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN) {
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_ACK, {
          requestId,
          partitionId: this.partitionId,
        });
        return {
          request_id: requestId,
          status: PARTITION_SERVICE_STATUS.INITIATED,
          message: PARTITION_SERVICE_LOG_MSG.REPLICA_REMOVAL_SELF,
        };
      }
      // Ensure cleanup on error - reject the pending request if still tracked
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
  scheduleLearnerPromotion() {
    if (this.learnerPromotionTimer) {
      return;
    }
    if (this.isShutdown) {
      this.logger.debug(
        PARTITION_SERVICE_LOG_MSG.TIMER_SKIPPED_AFTER_SHUTDOWN, {
          partitionId: this.partitionId,
          timer: 'learnerPromotionTimer',
        });
      return;
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_SCHEDULED, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      delayMs: this.learnerPromotionDelayMs,
    });

    this.learnerPromotionTimer = setTimeout(() => {
      this.checkLearnerPromotion();
    }, this.learnerPromotionDelayMs);
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

    // Only promote if still in learner role
    if (this.role !== RaftRole.LEARNER) {
      return;
    }

    // Do not promote until we know who the current leader is.
    // Promoting without an observed leader can trigger election storms.
    if (!this.leaderId) {
      this.leaderId = this.resolveLeaderIdFromMetadata() ||
        this.resolveLeaderIdFromHint() ||
        null;
    }
    if (!this.leaderId) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        reason: 'leader_not_discovered',
      });
      this.scheduleLearnerPromotion();
      return;
    }

    // Check if promoting would result in an even number of voters
    // This prevents election storms caused by split votes (e.g., 2-2)
    // Count current active voters (followers + candidates + leader, excluding learners)
    const activeVoterCount = this.countActiveVoters();
    const learnerCount = this.countPendingLearners();

    // If promoting this learner would result in an even number of voters,
    // defer promotion until the old replica is removed
    // activeVoterCount is current voters, adding this learner makes it activeVoterCount + 1
    const targetReplicaCount = this.getTargetReplicaCountForPromotion();
    const isCriticalSystemPartition =
      CRITICAL_SYSTEM_PARTITION_IDS.has(this.partitionId);
    const singleReplacementPromotionAllowed =
      this.isJoiningExistingGroup === true &&
      learnerCount === NUM.ONE &&
      activeVoterCount >= targetReplicaCount;
    const maxAllowedVotersAfterPromotion = targetReplicaCount +
      (singleReplacementPromotionAllowed ? NUM.ONE : NUM.ZERO);
    const votersAfterPromotion = activeVoterCount + NUM.ONE;
    const wouldExceedTargetReplicaCount =
      votersAfterPromotion > maxAllowedVotersAfterPromotion;
    const wouldBeEven = votersAfterPromotion % NUM.TWO === NUM.ZERO;

    // Check if promoting ALL learners would result in an odd count
    // This handles the case where multiple nodes join simultaneously
    // e.g., 3 voters + 2 learners = 5 (odd) - allow promotion
    const votersAfterAllLearners = activeVoterCount + learnerCount;
    const allLearnersWouldBeOdd = votersAfterAllLearners % NUM.TWO === NUM.ONE;
    const allLearnersWithinTarget =
      votersAfterAllLearners <= targetReplicaCount;
    const multiLearnerPromotionAllowed =
      allLearnersWouldBeOdd && allLearnersWithinTarget;

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
      singleReplacementPromotionAllowed,
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
        reason: 'would_exceed_target_replica_count',
      });
      this.scheduleLearnerPromotion();
      return;
    }

    // Allow promotion if:
    // 1. Promoting this learner alone would result in odd count, OR
    // 2. This is the single temporary replacement learner above target, OR
    // 3. There are multiple learners and promoting ALL would result in odd count
    //    without exceeding the configured replica target
    if (
      wouldBeEven &&
      activeVoterCount >= NUM.THREE &&
      !singleReplacementPromotionAllowed &&
      !multiLearnerPromotionAllowed
    ) {
      // Defer promotion - reschedule check after a shorter interval
      // The old replica should be removed soon, which will make the count odd again
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        activeVoterCount,
        targetReplicaCount,
        votersAfterPromotion,
        learnerCount,
        votersAfterAllLearners,
        reason: allLearnersWouldBeOdd ?
          'would_exceed_target_replica_count' :
          'would_cause_even_voter_count',
      });
      this.scheduleLearnerPromotion();
      return;
    }

    // Log if we're allowing promotion due to multiple learners
    if (wouldBeEven && multiLearnerPromotionAllowed) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_ALLOWED_MULTI, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        activeVoterCount,
        learnerCount,
        targetReplicaCount,
        votersAfterAllLearners,
      });
    }

    // Promote to follower - now eligible to participate in elections
    this.role = RaftRole.FOLLOWER;
    this.queueRoleUpdate(this.role);

    this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTED_TO_FOLLOWER, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      leaderId: this.leaderId,
      activeVoterCount: votersAfterPromotion,
    });

    // Start election timer now that we're a full participant
    this.startElection();
  }

  /**
   * Count pending learners in the Raft group.
   * Uses the system table cache to get current replica states.
   * @return {number} Number of pending learners.
   * @private
   */
  countPendingLearners() {
    // If no system table cache, return 1 (just this learner)
    if (!this.systemTableCache) {
      return NUM.ONE;
    }

    // Query services table for replicas of this partition
    const services = this.systemTableCache.filter(TABLES.SERVICES, (service) => {
      return service.partition_id === this.partitionId &&
        service.service_type === SERVICE_TYPE.PARTITION;
    });

    // Count replicas that are learners
    let learnerCount = NUM.ZERO;
    for (const service of services) {
      const status = service.status || ReplicaStatus.ACTIVE;
      const raftRole = service.raft_role;

      // Skip failed, removing, or removed replicas
      if (status === ReplicaStatus.FAILED ||
          status === ReplicaStatus.REMOVING ||
          status === ReplicaStatus.REMOVED) {
        continue;
      }

      // Count learners
      if (raftRole === PARTITION_RAFT_ROLE.LEARNER) {
        learnerCount++;
      }
    }

    // Ensure we count at least 1 (this learner) even if cache is stale
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
    const partitionRow = this.getCachedSystemTableRow(TABLES.PARTITIONS, (partition) =>
      partition?.[COLUMN.PARTITION_ID] === this.partitionId,
    );
    const configuredReplicaCount = Number(
      partitionRow?.[PARTITION_REPLICA_COUNT_FIELD],
    );
    if (Number.isFinite(configuredReplicaCount) &&
        configuredReplicaCount > NUM.ZERO) {
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
    // If no system table cache, fall back to replicaIds count
    // This is a conservative estimate that may include learners
    if (!this.systemTableCache) {
      return this.replicaIds.length;
    }

    // Query services table for replicas of this partition
    const services = this.systemTableCache.filter(TABLES.SERVICES, (service) => {
      return service.partition_id === this.partitionId &&
        service.service_type === SERVICE_TYPE.PARTITION;
    });

    // Count replicas that are active voters (not learners, not failed, not removing)
    let voterCount = NUM.ZERO;
    for (const service of services) {
      const status = service.status || ReplicaStatus.ACTIVE;
      const raftRole = service.raft_role;

      // Skip failed, removing, or removed replicas
      if (status === ReplicaStatus.FAILED ||
          status === ReplicaStatus.REMOVING ||
          status === ReplicaStatus.REMOVED) {
        continue;
      }

      // Skip learners (they don't vote)
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
      if (typeof this.rebalancer.setLeader ===
          PARTITION_SERVICE_TYPE.FUNCTION) {
        this.rebalancer.setLeader(false);
      }
      if (typeof this.rebalancer.shutdown ===
          PARTITION_SERVICE_TYPE.FUNCTION) {
        this.rebalancer.shutdown();
      }
      this.rebalancer = null;
    }
    if (this.rebalanceCoordinator && this.ownsRebalanceCoordinator) {
      try {
        await this.rebalanceCoordinator.shutdown();
      } catch (error) {
        this.logger.warn(
          PARTITION_SERVICE_ERROR_MSG
            .REBALANCE_COORDINATOR_SHUTDOWN_FAILED,
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
    const pendingRequestTrackerStats = this.pendingRequestTracker &&
      typeof this.pendingRequestTracker.getStats === 'function' ?
      this.pendingRequestTracker.getStats() :
      null;
    return {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      role: this.role,
      isLeader: this.isLeader,
      initialized: this.initialized,
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

    // Clear learner promotion timer
    if (this.learnerPromotionTimer) {
      clearTimeout(this.learnerPromotionTimer);
      this.learnerPromotionTimer = null;
    }
    this.peerReconciliationScheduled = false;
    if (this.systemTableCache &&
        typeof this.systemTableCache.offCacheChange === PARTITION_SERVICE_TYPE.FUNCTION &&
        this.systemTableCacheChangeListener) {
      this.systemTableCache.offCacheChange(this.systemTableCacheChangeListener);
    }

    // Close log adapter first to prevent database access after close
    // This must happen before raft.end() to avoid race conditions
    if (this.logAdapter) {
      this.logAdapter.close();
    }

    // Stop liferaft instance - clear all timers first
    if (this.raft) {
      this.raftProvider.shutdownNode(this.raft);
      this.raft = null;
    }

    // Stop periodic size updates
    this.stopPeriodicSizeUpdates();
    this.stopPreparedStateHoldTimeoutSweep();

    if (typeof this.releaseMetadataPublicationReadinessListener ===
      PARTITION_SERVICE_TYPE.FUNCTION) {
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

    // Clear pending requests via PendingRequestTracker (Requirements: 3.5)
    if (this.pendingRequestTracker) {
      this.pendingRequestTracker.clear();
    }

    await this.quiesceRebalancing();

    // Unregister from transport
    if (this.transport) {
      this.transport.unregister(this.unifiedAddress);
    }

    // Close database
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
    this.recentlyAppliedEntryKeys.clear();
    this.recentlyAppliedEntryOrder = [];

    this.emit(PARTITION_SERVICE_EVENT.SHUTDOWN, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }
}

export {
  PartitionService,
  PartitionState,
  RaftRole,
  CDCOperation,
  PartitionRaftLogEntry,
  PartitionRaftStorage,
};
