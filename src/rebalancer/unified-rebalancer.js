/**
 * Unified Rebalancer - Manages replica placement for partitions and message groups.
 * Uses the same algorithm for all scenarios, driven by policies.
 * Operates fully autonomously - operators never manually specify replica placement.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.10
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  getPartitionRowFromCache,
  isPriorityControlPlanePartition,
  isSystemTablePartition,
} from '../bootstrap/system-partition-classification.js';
import {
  isBackgroundWorkReadySnapshot as isBackgroundWorkLifecycleReadySnapshot,
} from '../bootstrap/traffic-readiness-utils.js';
import {StartupRecoveryCoordinator} from '../bootstrap/startup-recovery-coordinator.js';
import {MovePlanner} from './move-planner.js';
import {StoragePressureBehavior} from './storage-pressure-behavior.js';
import {
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  OperationType,
  ReplicaStatus,
  TERMINAL_STATUSES,
  TERMINAL_STATUS_SQL_CLAUSE,
  isCoordinatorOwnedOperationType,
} from './replica-status.js';
import {assertCritical} from '../utils/assert.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../control-plane/control-plane-readiness-service.js';
import {
  createControlPlaneRuntimeBundle,
} from '../control-plane/control-plane-runtime-bundle.js';
import {
  isNodeReadyWithConnection,
  isNodeReadyWithTransport,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
  wasNodeRecordReadyWhenWritten,
} from '../node/node-readiness-policy.js';
import {
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  getLocalControlPlaneMutationReadinessBlocker,
} from '../control-plane/control-plane-mutation-readiness.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../control-plane/control-plane-publication-merge.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  LIFECYCLE_PHASE,
} from '../bootstrap/lifecycle-controller-constants.js';
import {
  REBALANCER_CONFIG_KEY,
  REBALANCER_DEFAULT,
  REBALANCER_DEFAULT_POLICY,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_ERROR_MSG,
  REBALANCER_EVENT,
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_TYPE,
  REBALANCER_NODE_STATUS,
  REBALANCER_QUEUE_NAME,
  REBALANCER_SKIP_REASON,
  REBALANCER_SUBSYSTEM,
  REBALANCER_TRIGGER,
  READINESS_SKIP_DETAIL,
  STABILIZATION_RESET_TRIGGER,
} from './rebalancer-constants.js';
import {
  CLUSTER_READINESS_TIMEOUT_MS,
} from '../constants/cdc-lifecycle-constants.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  META_SERVICE_ID,
  NUM,
  STATE,
  SERVICE_STATUS,
  TABLES,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {ENDPOINT_SYNC_HEALTH} from '../runtime/endpoint-sync-constants.js';
import {
  normalizeNodeRow,
  normalizeNodeEndpointRow,
  normalizeServiceEndpointRow,
  normalizeServiceRow,
} from '../control-plane/system-row-normalizers.js';
import {OwnerKeyReconcileQueue} from
  '../workflow/owner-key-reconcile-queue.js';
import {RECONCILE_REASON} from
  '../workflow/reconcile-queue-constants.js';
import {
  adjustToOddCount,
  getNextOddCount,
  getPreviousOddCount,
  isOddReplicaCount,
} from './odd-replica-count.js';
import {
  isReplicaOperationInFlight,
  isReplicaOperationStale,
  normalizeReplicaOperationRecord,
} from './replica-operation-liveness.js';

const EntityType = REBALANCER_ENTITY_TYPE;

const TriggerType = REBALANCER_TRIGGER;

const MoveType = REBALANCER_MOVE_TYPE;

const NodeStatus = REBALANCER_NODE_STATUS;

const DEFAULT_TABLE_POLICY = REBALANCER_DEFAULT_POLICY.TABLE;

const DEFAULT_MESSAGE_GROUP_POLICY = REBALANCER_DEFAULT_POLICY.MESSAGE_GROUP;

const SQL_BUDGET = Object.freeze({
  SELECT_REBALANCE_BUDGET:
    'SELECT config_value FROM config WHERE config_key = ? LIMIT 1',
  SELECT_IN_FLIGHT_COUNT:
    `SELECT COUNT(*) AS total_count FROM replica_operations
     WHERE type IN (${COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE})
     AND status NOT IN (${TERMINAL_STATUS_SQL_CLAUSE})`,
});

const PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS = Object.freeze({
  preferAuthoritativeCount: true,
  bypassEmptyQueryDelay: true,
});

const PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT = 3;

const PRIORITY_PARTITION_SUMMARY_FIELDS = Object.freeze({
  CAMEL: 'priorityPartitionSummary',
  SNAKE: 'priority_partition_summary',
});

const CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON = Object.freeze({
  NODE_READY_LEASE_INCOMPLETE: 'node_ready_lease_incomplete',
  TRANSITIONAL_NODE_MEMBERSHIP: 'transitional_node_membership',
  TRANSPORT_MEMBERSHIP_EXCEEDS_NODES_CACHE:
    'transport_membership_exceeds_nodes_cache',
  ENDPOINT_VISIBILITY_INCOMPLETE: 'endpoint_visibility_incomplete',
  TOPOLOGY_OPERATIONS_IN_FLIGHT: 'topology_operations_in_flight',
});

const TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE = Object.freeze({
  CACHE: 'cache',
  AUTHORITATIVE: 'authoritative',
});

/**
 * UnifiedRebalancer manages replica placement for both partitions and message groups.
 * Each partition/message group leader runs its own rebalancer instance.
 * Leaders make independent decisions that converge to optimal state.
 *
 * NOTE: This class delegates operation execution to RebalanceCoordinator.
 */
class UnifiedRebalancer extends EventEmitter {
  /**
   * Create a new UnifiedRebalancer instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.entityId - Partition ID or message group ID.
   * @param {string} options.entityType - 'partition' or 'message_group'.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {Object} options.tablePolicyService - TablePolicyService for policy lookup.
   * @param {string} options.nodeId - Current node ID.
   * @param {Object} options.rebalanceCoordinator - RebalanceCoordinator for operation execution.
   */
  constructor(options = {}) {
    super();

    this.entityId = assertCritical(
      options.entityId,
      REBALANCER_ERROR_MSG.ENTITY_ID_REQUIRED,
    );
    this.entityType = assertCritical(
      options.entityType,
      REBALANCER_ERROR_MSG.ENTITY_TYPE_REQUIRED,
    );
    this.systemTableCache = assertCritical(
      options.systemTableCache,
      REBALANCER_ERROR_MSG.CACHE_REQUIRED,
    );
    this.cdcIntegrationService = assertCritical(
      options.cdcIntegrationService,
      REBALANCER_ERROR_MSG.CDC_REQUIRED,
    );
    this.tablePolicyService = assertCritical(
      options.tablePolicyService,
      REBALANCER_ERROR_MSG.POLICY_REQUIRED,
    );
    this.nodeId = assertCritical(
      options.nodeId,
      REBALANCER_ERROR_MSG.NODE_ID_REQUIRED,
    );
    this.messageRouter = assertCritical(
      options.messageRouter,
      REBALANCER_ERROR_MSG.ROUTER_REQUIRED,
    );
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getSqlQueryEngine: () => this.sqlQueryEngine,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemTableCache,
        getMessageRouter: () => this.messageRouter,
      }).controlPlaneSystemTableGateway;

    // RebalanceCoordinator for delegated operation execution (Requirements 2.5)
    this.rebalanceCoordinator = assertCritical(
      options.rebalanceCoordinator,
      REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED,
    );

    // Leadership state
    this.isLeader = false;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.periodicCheckIntervalMs =
      config.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_INTERVAL_MS) ||
      REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_INTERVAL_MS;
    this.periodicCheckJitterMs =
      config.get(REBALANCER_CONFIG_KEY.PERIODIC_CHECK_JITTER_MS) ||
      REBALANCER_DEFAULT.UNIFIED.PERIODIC_CHECK_JITTER_MS;
    this.criticalCheckDelayMs =
      config.get(REBALANCER_CONFIG_KEY.CRITICAL_CHECK_DELAY_MS) ||
      REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS;
    this.maxConcurrentMoves =
      config.get(REBALANCER_CONFIG_KEY.MAX_CONCURRENT_MOVES) ||
      REBALANCER_DEFAULT.UNIFIED.MAX_CONCURRENT_MOVES;
    this.moveTimeoutMs =
      config.get(REBALANCER_CONFIG_KEY.MOVE_TIMEOUT_MS) ||
      REBALANCER_DEFAULT.UNIFIED.MOVE_TIMEOUT_MS;
    this.moveBatchSize =
      config.get(REBALANCER_CONFIG_KEY.MOVE_BATCH_SIZE) ||
      REBALANCER_DEFAULT.UNIFIED.MOVE_BATCH_SIZE;
    this.interBatchDelayMs =
      config.get(REBALANCER_CONFIG_KEY.INTER_BATCH_DELAY_MS) ||
      REBALANCER_DEFAULT.UNIFIED.INTER_BATCH_DELAY_MS;
    this.rebalanceBudget =
      config.get(REBALANCER_CONFIG_KEY.REBALANCE_BUDGET) ||
      REBALANCER_DEFAULT.UNIFIED.REBALANCE_BUDGET;
    this.criticalBudgetMultiplier =
      REBALANCER_DEFAULT.UNIFIED.CRITICAL_BUDGET_MULTIPLIER;
    this.nodeCpuThreshold =
      config.get(REBALANCER_CONFIG_KEY.NODE_CPU_THRESHOLD) ||
      REBALANCER_DEFAULT.UNIFIED.NODE_CPU_THRESHOLD;
    this.nodeMemoryThreshold =
      config.get(REBALANCER_CONFIG_KEY.NODE_MEMORY_THRESHOLD) ||
      REBALANCER_DEFAULT.UNIFIED.NODE_MEMORY_THRESHOLD;
    this.nodeDiskThreshold =
      config.get(REBALANCER_CONFIG_KEY.NODE_DISK_THRESHOLD) ||
      REBALANCER_DEFAULT.UNIFIED.NODE_DISK_THRESHOLD;
    this.enableReadinessPing =
      config.get(REBALANCER_CONFIG_KEY.READINESS_PING_ENABLED) ||
      REBALANCER_DEFAULT.UNIFIED.READINESS_PING_ENABLED;
    this.readinessPingTimeoutMs =
      config.get(REBALANCER_CONFIG_KEY.READINESS_PING_TIMEOUT_MS) ||
      REBALANCER_DEFAULT.UNIFIED.READINESS_PING_TIMEOUT_MS;

    // Stabilization period configuration (Requirements 2.1)
    const configuredStabilization =
      config.get(REBALANCER_CONFIG_KEY.STABILIZATION_PERIOD_MS);
    this.minStabilizationMs = REBALANCER_DEFAULT.UNIFIED.MIN_STABILIZATION_MS;
    this.maxStabilizationMs = REBALANCER_DEFAULT.UNIFIED.MAX_STABILIZATION_MS;
    this.defaultStabilizationMs = REBALANCER_DEFAULT.UNIFIED.DEFAULT_STABILIZATION_MS;
    // Clamp to valid range [1000ms, 10000ms] with default 1000ms
    this.stabilizationPeriodMs = this.clampStabilizationPeriod(
      configuredStabilization ?? this.defaultStabilizationMs,
    );
    this.systemPartitionStartDelayMs = this.resolveNonNegativeMs(
      config.get(REBALANCER_CONFIG_KEY.SYSTEM_PARTITION_START_DELAY_MS),
      REBALANCER_DEFAULT.UNIFIED.SYSTEM_PARTITION_START_DELAY_MS,
    );
    this.userPartitionStartDelayMs = this.resolveNonNegativeMs(
      config.get(REBALANCER_CONFIG_KEY.USER_PARTITION_START_DELAY_MS),
      REBALANCER_DEFAULT.UNIFIED.USER_PARTITION_START_DELAY_MS,
    );
    // Per-entity random offset spreads start-delay eligibility across
    // the jitter window so all system partitions don't become eligible
    // simultaneously (thundering herd prevention).
    this.rebalanceStartAtMs = Date.now() +
      Math.floor(Math.random() * this.periodicCheckJitterMs);

    // Stabilization state
    // Initialize to current time so rebalancer waits for stabilization period
    // before first check (prevents premature rebalancing during bootstrap)
    this.lastStateChangeTime = Date.now();
    this.stabilizationTimer = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(REBALANCER_SUBSYSTEM.UNIFIED) : console;

    // State
    this.lastRebalanceTime = null;
    this.rebalanceCount = 0;
    this.lastDegradedTargetSignal = null;
    this.lastSuboptimalSignal = null;

    // Scheduler state
    this.scheduledCheck = null;
    this.currentInterval = this.periodicCheckIntervalMs;
    this.maxInterval = this.periodicCheckIntervalMs * 2;

    // Storage capacity services.
    this.storageAdmissionService =
      options.storageAdmissionService ||
      this.rebalanceCoordinator?.storageAdmissionService ||
      null;
    this.storageAccountingService =
      options.storageAccountingService ||
      this.rebalanceCoordinator?.storageAccountingService ||
      null;
    this.managesStoragePressureBehavior = !options.storagePressureBehavior;
    this.storagePressureBehavior =
      options.storagePressureBehavior ||
      (this.storageAccountingService ?
        new StoragePressureBehavior({
          accountingService: this.storageAccountingService,
        }) :
        null);
    this.cdcGroupPropagationService =
      options.cdcGroupPropagationService ||
      this.rebalanceCoordinator?.cdcGroupPropagationService ||
      null;
    this.bootstrapReadinessState =
      options.bootstrapReadinessState ||
      this.rebalanceCoordinator?.bootstrapReadinessState ||
      null;
    this.startupRecoveryCoordinator =
      options.startupRecoveryCoordinator ||
      this.rebalanceCoordinator?.startupRecoveryCoordinator ||
      new StartupRecoveryCoordinator({
        readinessState: this.bootstrapReadinessState,
      });
    this.controlPlaneReadinessService =
      options.controlPlaneReadinessService ||
      new ControlPlaneReadinessService({
        nodeId: this.nodeId,
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        storageAccountingService: this.storageAccountingService,
        cdcIntegrationService: this.cdcIntegrationService,
        cdcGroupPropagationService: this.cdcGroupPropagationService,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
      });

    // Cluster readiness gate (optional, for bootstrap-lifecycle-hardening)
    // When provided, defers first planning cycle until cluster is ready.
    this.clusterReadinessSignal = options.clusterReadinessSignal || null;
    this.clusterReadinessConfirmed = !this.clusterReadinessSignal;
    this.clusterReadinessStartMs = null;
    this.clusterReadinessTimeoutMs = CLUSTER_READINESS_TIMEOUT_MS;

    // Planning is delegated to MovePlanner (single-path planning).
    this.movePlanner = new MovePlanner({
      entityId: this.entityId,
      entityType: this.entityType,
      moveStateProvider: this,
      storageAdmissionService: this.storageAdmissionService,
      accountingService: this.storageAccountingService,
      storagePressureBehavior: this.storagePressureBehavior,
      strictOwnerDependencies: true,
    });
    this.syncOwnerDependenciesFromCoordinator(this.rebalanceCoordinator);

    this.isShuttingDown = false;
    this.initialized = false;

    this.rebalanceCheckQueue = new OwnerKeyReconcileQueue({
      name: `${REBALANCER_QUEUE_NAME.REBALANCE_CHECK}:${this.entityId}`,
      reconcileFn: (_ownerKey, reasons) =>
        this.reconcileRebalanceCheck(reasons),
    });
  }

  /**
   * Initialize the rebalancer.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.isShuttingDown = false;
    this.logger.info(REBALANCER_LOG_MSG.INITIALIZED, {
      entityId: this.entityId,
      entityType: this.entityType,
      nodeId: this.nodeId,
      usingCoordinator: !!this.rebalanceCoordinator,
    });

    this.initialized = true;
  }

  /**
   * Set the RebalanceCoordinator for delegated operation execution.
   * Requirements: 2.5
   * @param {Object} coordinator - RebalanceCoordinator instance.
   */
  setRebalanceCoordinator(coordinator) {
    this.rebalanceCoordinator = coordinator;
    this.syncOwnerDependenciesFromCoordinator(coordinator);

    this.logger.info(REBALANCER_LOG_MSG.COORDINATOR_SET, {
      entityId: this.entityId,
      entityType: this.entityType,
      hasCoordinator: !!coordinator,
    });
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    if (Object.hasOwn(options, 'systemTableCache')) {
      this.systemTableCache = options.systemTableCache || null;
    }
    if (Object.hasOwn(options, 'cdcIntegrationService')) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (Object.hasOwn(options, 'tablePolicyService')) {
      this.tablePolicyService = options.tablePolicyService || null;
    }
    if (Object.hasOwn(options, 'messageRouter')) {
      this.messageRouter = options.messageRouter || null;
    }
    if (Object.hasOwn(options, 'sqlQueryEngine')) {
      this.sqlQueryEngine = options.sqlQueryEngine || null;
    }
    if (Object.hasOwn(options, 'bootstrapReadinessState')) {
      this.bootstrapReadinessState = options.bootstrapReadinessState || null;
      if (this.startupRecoveryCoordinator &&
          typeof this.startupRecoveryCoordinator.syncOwnerDependencies ===
            TYPEOF.FUNCTION) {
        this.startupRecoveryCoordinator.syncOwnerDependencies({
          readinessState: this.bootstrapReadinessState,
        });
      }
    }
    if (Object.hasOwn(options, 'startupRecoveryCoordinator')) {
      this.startupRecoveryCoordinator =
        options.startupRecoveryCoordinator || null;
    }

    if (this.controlPlaneReadinessService &&
        typeof this.controlPlaneReadinessService
          .syncOwnerDependencies === TYPEOF.FUNCTION) {
      this.controlPlaneReadinessService.syncOwnerDependencies({
        systemTableCache: this.systemTableCache,
        cacheMutationTarget: this.systemTableCache,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
      });
    }

    if (Object.hasOwn(options, 'rebalanceCoordinator')) {
      this.setRebalanceCoordinator(options.rebalanceCoordinator || null);
      return;
    }

    this.syncOwnerDependenciesFromCoordinator(this.rebalanceCoordinator);
  }

  /**
   * Synchronize owner-scoped dependencies from coordinator.
   * @param {Object|null} coordinator
   * @private
   */
  syncOwnerDependenciesFromCoordinator(coordinator) {
    if (!coordinator || typeof coordinator !== TYPEOF.OBJECT) {
      return;
    }
    if (coordinator.storageAdmissionService) {
      this.storageAdmissionService = coordinator.storageAdmissionService;
    }
    if (coordinator.storageAccountingService) {
      this.storageAccountingService = coordinator.storageAccountingService;
    }
    if (coordinator.cdcGroupPropagationService) {
      this.cdcGroupPropagationService = coordinator.cdcGroupPropagationService;
    }
    if (coordinator.bootstrapReadinessState) {
      this.bootstrapReadinessState = coordinator.bootstrapReadinessState;
    }
    if (coordinator.startupRecoveryCoordinator) {
      this.startupRecoveryCoordinator = coordinator.startupRecoveryCoordinator;
    } else if (this.startupRecoveryCoordinator &&
        typeof this.startupRecoveryCoordinator.syncOwnerDependencies ===
          TYPEOF.FUNCTION) {
      this.startupRecoveryCoordinator.syncOwnerDependencies({
        readinessState: this.bootstrapReadinessState,
      });
    }
    if (coordinator.controlPlaneReadinessService) {
      this.controlPlaneReadinessService =
        coordinator.controlPlaneReadinessService;
    }
    if (this.managesStoragePressureBehavior && this.storageAccountingService) {
      this.storagePressureBehavior = new StoragePressureBehavior({
        accountingService: this.storageAccountingService,
      });
    }
    if (this.movePlanner) {
      this.movePlanner.storageAdmissionService = this.storageAdmissionService;
      this.movePlanner.accountingService = this.storageAccountingService;
      this.movePlanner.storagePressureBehavior = this.storagePressureBehavior;
    }
  }

  /**
   * Set leadership status.
   * @param {boolean} isLeader - Whether this instance is the leader.
   */
  setLeader(isLeader) {
    if (this.isShuttingDown) {
      this.isLeader = false;
      this.cancelScheduledCheck();
      return;
    }

    const wasLeader = this.isLeader;
    this.isLeader = isLeader;

    if (isLeader && !wasLeader) {
      this.logger.info(REBALANCER_LOG_MSG.LEADER_START, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      this.scheduleNextCheck(this.getLeadershipStartDelayMs());
    } else if (!isLeader && wasLeader) {
      this.logger.info(REBALANCER_LOG_MSG.LEADER_STOP, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      this.cancelScheduledCheck();
    }
  }

  /**
   * Get the policy for this entity.
   * @return {Promise<Object>} The applicable policy.
   */
  async getPolicy() {
    if (this.entityType === EntityType.MESSAGE_GROUP) {
      return this.getMessageGroupPolicy();
    }
    if (this.entityType === EntityType.RUNTIME_SERVICE) {
      return this.getRuntimeServicePolicy();
    }
    return this.getTablePolicy();
  }

  /**
   * Get table policy for a partition.
   * Uses TablePolicyService for policy lookup.
   * @return {Promise<Object>} Table policy.
   */
  async getTablePolicy() {
    return this.tablePolicyService.getPolicyForPartition(this.entityId);
  }

  /**
   * Get message group policy.
   * @return {Object} Message group policy.
   */
  getMessageGroupPolicy() {
    // Delegate to TablePolicyService for canonical validation/merge
    return this.tablePolicyService.getMessageGroupPolicy(this.entityId);
  }

  /**
   * Get runtime service policy.
   * Returns the default runtime service placement policy.
   * @return {Object} Runtime service policy.
   */
  getRuntimeServicePolicy() {
    return {...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE};
  }

  /**
   * Clamp stabilization period to valid range [1000ms, 10000ms].
   * @param {number} value - Configured stabilization period.
   * @return {number} Clamped stabilization period.
   */
  clampStabilizationPeriod(value) {
    if (typeof value !== 'number' || isNaN(value)) {
      return this.defaultStabilizationMs;
    }
    return Math.max(this.minStabilizationMs, Math.min(this.maxStabilizationMs, value));
  }

  /**
   * Resolve non-negative millisecond value with fallback.
   * @param {*} value - Candidate config value.
   * @param {number} fallback - Fallback milliseconds.
   * @return {number} Non-negative milliseconds.
   */
  resolveNonNegativeMs(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
    return fallback;
  }

  /**
   * Whether this rebalancer manages a system table partition.
   * @return {boolean}
   */
  isSystemPartitionEntity() {
    if (this.entityType !== EntityType.PARTITION) {
      return false;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    return isSystemTablePartition({
      partitionId: this.entityId,
      partitionRow,
    });
  }

  /**
   * Resolve the readiness decision dimension for node-level rebalancer gates.
   * Critical system partitions must continue converging while publication
   * membership is still closing ACK_PENDING; ordinary entities remain strict.
   *
   * @return {string}
   * @private
   */
  resolveNodeReadinessDecisionDimension() {
    if (this.isSystemPartitionEntity()) {
      return CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }

  /**
   * Evaluate readiness eligibility for one decision dimension.
   * Falls back to repairEligible only when older snapshots do not yet expose
   * controlPlaneRecoveryEligible explicitly.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   * @private
   */
  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    const dimensions = readiness?.dimensions &&
      typeof readiness.dimensions === TYPEOF.OBJECT ?
      readiness.dimensions :
      null;
    if (!dimensions) {
      return false;
    }
    if (dimensions[decisionDimension] === true) {
      return true;
    }
    if (decisionDimension !==
        CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE) {
      return false;
    }
    if (Object.hasOwn(dimensions, decisionDimension)) {
      return false;
    }
    return dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] ===
      true;
  }

  /**
   * Whether this entity is one of the startup-critical control-plane
   * partitions that should converge ahead of ordinary workload rebalancing.
   * @return {boolean}
   */
  isControlPlanePriorityPartition() {
    if (this.entityType !== EntityType.PARTITION) {
      return false;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    return isPriorityControlPlanePartition({
      partitionId: this.entityId,
      partitionRow,
    });
  }

  /**
   * Resolve the minimum number of ACTIVE nodes that must satisfy readiness
   * before this entity may continue critical topology spread.
   *
   * Priority control-plane partitions converge against a quorum target during
   * startup so one flapping joiner does not stall every other priority table.
   *
   * @param {number} activeNodeCount
   * @return {number}
   * @private
   */
  resolveCriticalSystemRequiredHealthyNodeCount(activeNodeCount) {
    const normalizedActiveNodeCount =
      Number.isInteger(activeNodeCount) && activeNodeCount > NUM.ZERO ?
        activeNodeCount :
        NUM.ZERO;
    if (normalizedActiveNodeCount === NUM.ZERO) {
      return NUM.ZERO;
    }
    if (!this.isControlPlanePriorityPartition()) {
      return normalizedActiveNodeCount;
    }
    const targetReplicaCount =
      this.getPriorityControlPlaneTargetReplicaCount();
    const quorumTarget = Math.max(
      NUM.ONE,
      Math.floor(targetReplicaCount / NUM.TWO) + NUM.ONE,
    );
    return Math.min(quorumTarget, normalizedActiveNodeCount);
  }

  /**
   * Resolve the configured voter target for this priority control-plane
   * partition from the canonical partitions owner row.
   *
   * @return {number}
   * @private
   */
  getPriorityControlPlaneTargetReplicaCount() {
    if (!this.isControlPlanePriorityPartition()) {
      return PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT;
    }
    const partitionRow = getPartitionRowFromCache(
      this.systemTableCache,
      this.entityId,
    );
    const configuredReplicaCount = Number(
      partitionRow?.replica_count ?? partitionRow?.replicaCount,
    );
    if (Number.isFinite(configuredReplicaCount) &&
        configuredReplicaCount > NUM.ZERO) {
      return Math.floor(configuredReplicaCount);
    }
    return PRIORITY_CONTROL_PLANE_RECOVERY_FALLBACK_REPLICA_COUNT;
  }

  /**
   * Resolve the short retry cadence used while startup-critical control-plane
   * partitions wait on gating conditions.
   * @return {number}
   */
  getPriorityRetryDelayMs() {
    const configuredDelayMs =
      Number.isFinite(this.criticalCheckDelayMs) &&
        this.criticalCheckDelayMs > NUM.ZERO ?
        Math.floor(this.criticalCheckDelayMs) :
        REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS;
    return Math.max(1000, configuredDelayMs);
  }

  /**
   * Resolve the first scheduler delay after leadership activation.
   * Priority control-plane partitions should begin checking quickly instead
   * of inheriting the ordinary 60s+ periodic cadence.
   * @return {number}
   */
  getLeadershipStartDelayMs() {
    if (this.isControlPlanePriorityPartition()) {
      return Math.max(
        1,
        Math.floor(Math.random() * this.getPriorityRetryDelayMs()),
      );
    }
    // Stagger initial check with per-entity random offset to avoid
    // thundering herd when many partitions become leaders at once
    // (e.g. during bootstrap or rolling restarts).
    const initialJitter =
      Math.floor(Math.random() * this.periodicCheckIntervalMs);
    return this.periodicCheckIntervalMs + initialJitter;
  }

  /**
   * Schedule a follow-up check using the priority control-plane cadence when
   * this entity owns startup-critical control-plane work.
   * @param {number|null} [delayMs]
   */
  schedulePriorityAwareCheck(delayMs = null) {
    if (this.isControlPlanePriorityPartition()) {
      this.scheduleNextCheck(this.getPriorityRetryDelayMs());
      return;
    }
    this.scheduleNextCheck(delayMs);
  }

  /**
   * Resolve start delay before rebalancing is eligible.
   * @return {number} Delay in milliseconds.
   */
  getRebalanceStartDelayMs() {
    if (this.entityType !== EntityType.PARTITION) {
      return 0;
    }
    if (this.isSystemPartitionEntity()) {
      return this.systemPartitionStartDelayMs;
    }
    return this.userPartitionStartDelayMs;
  }

  /**
   * Milliseconds remaining until this entity is eligible for rebalancing.
   * @param {number} [nowMs=Date.now()] - Current timestamp.
   * @return {number} Remaining milliseconds, or 0 if eligible.
   */
  getTimeUntilRebalanceStartEligible(nowMs = Date.now()) {
    const delayMs = this.getRebalanceStartDelayMs();
    if (delayMs <= 0) {
      return 0;
    }
    const elapsed = nowMs - this.rebalanceStartAtMs;
    const remaining = delayMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Check if stabilization period has elapsed since last state change.
   * Requirements: 2.2, 2.3
   * @return {boolean} True if stable (no recent state changes).
   */
  isStabilized() {
    if (!this.lastStateChangeTime) {
      return true;
    }
    const elapsed = Date.now() - this.lastStateChangeTime;
    return elapsed >= this.stabilizationPeriodMs;
  }

  /**
   * Record a state change and reset stabilization timer.
   * Requirements: 2.5
   * @param {string} reason - Reason for state change.
   */
  recordStateChange(reason) {
    if (this.isShuttingDown) {
      return;
    }

    this.lastStateChangeTime = Date.now();

    this.logger.debug(REBALANCER_LOG_MSG.STABILIZATION_RESET, {
      entityId: this.entityId,
      reason,
      stabilizationPeriodMs: this.stabilizationPeriodMs,
    });

    // Cancel any pending stabilization check
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer);
      this.stabilizationTimer = null;
    }

    // Schedule check after stabilization period
    if (this.isLeader) {
      this.stabilizationTimer = setTimeout(() => {
        this.stabilizationTimer = null;
        // Avoid unhandled rejections from timer-triggered checks during shutdown races.
        void this.checkRebalance().catch(() => {});
      }, this.stabilizationPeriodMs);
    }
  }

  /**
   * Get the current stabilization period in milliseconds.
   * @return {number} Stabilization period.
   */
  getStabilizationPeriodMs() {
    return this.stabilizationPeriodMs;
  }

  /**
   * Get the time remaining until stabilization completes.
   * @return {number} Milliseconds remaining, or 0 if already stable.
   */
  getTimeUntilStabilized() {
    if (!this.lastStateChangeTime) {
      return 0;
    }
    const elapsed = Date.now() - this.lastStateChangeTime;
    const remaining = this.stabilizationPeriodMs - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Validate and adjust replica count to be odd.
   * @param {number} count - Desired replica count.
   * @param {Object} policy - Policy with min/max constraints.
   * @return {number} Valid odd replica count.
   */
  validateReplicaCount(count, policy) {
    return this.movePlanner.validateReplicaCount(count, policy);
  }

  /**
   * Calculate target replica count based on policy and current state.
   * Supports growing/shrinking in odd increments (3→5→7 or 7→5→3).
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {number} Target replica count.
   */
  calculateTargetReplicaCount(currentReplicas, policy) {
    return this.movePlanner.calculateTargetReplicaCount(
      currentReplicas,
      policy,
    );
  }

  /**
   * Get desired replica target from policy.
   * @param {Object} policy - Applicable policy.
   * @return {number} Desired policy target.
   */
  getPolicyTargetReplicaCount(policy) {
    return this.movePlanner.getPolicyTargetReplicaCount(policy);
  }

  /**
   * Get actionable target based on currently available ready nodes.
   * @param {Object} policy - Applicable policy.
   * @param {Array<Object>} availableNodes - Ready nodes.
   * @return {number} Actionable target for current topology.
   */
  getActionableTargetReplicaCount(policy, availableNodes) {
    return this.movePlanner.getActionableTargetReplicaCount(
      policy,
      availableNodes,
    );
  }

  /**
   * Resolve the latest membership publication row, regardless of status.
   * @return {Object|null}
   * @private
   */
  getLatestMembershipPublicationRow() {
    const readinessService = this.controlPlaneReadinessService;
    const publicationService = readinessService?.membershipPublicationService;
    let publicationRow = null;
    if (publicationService &&
        typeof publicationService.getLatestClusterPublicationSync ===
          TYPEOF.FUNCTION) {
      publicationRow = publicationService.getLatestClusterPublicationSync();
    } else if (publicationService &&
        typeof publicationService.getLatestPublicationRowSync ===
          TYPEOF.FUNCTION) {
      publicationRow = publicationService.getLatestPublicationRowSync();
    }
    return publicationRow &&
      typeof publicationRow === TYPEOF.OBJECT ?
      publicationRow :
      null;
  }

  /**
   * Resolve the latest published membership row when available.
   * @return {Object|null}
   * @private
   */
  getLatestPublishedMembershipRow() {
    const readinessService = this.controlPlaneReadinessService;
    const publicationService = readinessService?.membershipPublicationService;
    let publicationRow = this.getLatestMembershipPublicationRow();

    if (String(publicationRow?.status || '').toUpperCase() !==
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED) {
      if (publicationService &&
          typeof publicationService.getLatestPublishedClusterPublicationSync ===
            TYPEOF.FUNCTION) {
        publicationRow =
          publicationService.getLatestPublishedClusterPublicationSync();
      } else if (publicationService &&
          typeof publicationService.getLatestPublishedPublicationRowSync ===
            TYPEOF.FUNCTION) {
        publicationRow =
          publicationService.getLatestPublishedPublicationRowSync();
      }
    }

    return String(publicationRow?.status || '').toUpperCase() ===
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ?
      publicationRow :
      null;
  }

  /**
   * Resolve the normalized priority-partition summary payload from a
   * publication row.
   * @param {Object|null} publicationRow
   * @return {Object|null}
   * @private
   */
  getPriorityPartitionSummary(publicationRow = null) {
    if (!publicationRow || typeof publicationRow !== TYPEOF.OBJECT) {
      return null;
    }
    const summary =
      publicationRow[PRIORITY_PARTITION_SUMMARY_FIELDS.CAMEL] ??
      publicationRow[PRIORITY_PARTITION_SUMMARY_FIELDS.SNAKE] ??
      null;
    return summary && typeof summary === TYPEOF.OBJECT ?
      summary :
      null;
  }

  /**
   * Priority control-plane recovery remains active while the latest
   * publication row still reports spread unsatisfied.
   * @return {boolean}
   * @private
   */
  isPriorityControlPlaneRecoveryActive() {
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    const publicationRow = this.getLatestMembershipPublicationRow();
    const priorityPartitionSummary =
      this.getPriorityPartitionSummary(publicationRow);
    if (!priorityPartitionSummary) {
      return false;
    }
    return priorityPartitionSummary.satisfied === false;
  }

  /**
   * During active priority control-plane recovery we must not deadlock by
   * filtering candidate nodes to the last published active membership set.
   * All other placement continues to use published membership as steady-state
   * topology truth.
   * @return {boolean}
   * @private
   */
  shouldConstrainAvailableNodesToPublishedMembership() {
    if (!this.isControlPlanePriorityPartition()) {
      return true;
    }
    return !this.isPriorityControlPlaneRecoveryActive();
  }

  /**
   * Resolve the steady-state published active-node set when available.
   * @return {Set<string>|null}
   * @private
   */
  getPublishedActiveNodeIdSet() {
    const publicationRow = this.getLatestPublishedMembershipRow();
    if (!publicationRow) {
      return null;
    }

    const nodeIds = Array.isArray(publicationRow.publishedActiveNodeIds) ?
      publicationRow.publishedActiveNodeIds :
      Array.isArray(publicationRow.published_active_node_ids) ?
        publicationRow.published_active_node_ids :
        [];
    return new Set(nodeIds.filter((nodeId) =>
      typeof nodeId === TYPEOF.STRING && nodeId.length > 0,
    ));
  }

  /**
   * Apply policy to determine if rebalancing is needed.
   * @param {Object} policy - Policy to apply.
   * @return {Object} Rebalancing decision with reason.
   */
  applyPolicy(policy) {
    return this.movePlanner.applyPolicy(policy);
  }


  /**
   * Get all available nodes from the cache.
   * @readModel REBALANCE_AVAILABLE_NODES — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @return {Array<Object>} Array of active nodes.
   */
  getAvailableNodes() {
    const publishedActiveNodeIds =
      this.shouldConstrainAvailableNodesToPublishedMembership() ?
        this.getPublishedActiveNodeIdSet() :
        null;
    const readinessDecisionDimension =
      this.resolveNodeReadinessDecisionDimension();
    return this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.NODES,
      (node) => {
        const nodeId = node?.node_id || null;
        if (!nodeId) {
          return false;
        }
        if (publishedActiveNodeIds && !publishedActiveNodeIds.has(nodeId)) {
          return false;
        }
        const readiness = this.controlPlaneReadinessService
          .getNodeReadinessSync(nodeId, {
            decisionDimension:
              readinessDecisionDimension,
          });
        return this.isReadinessDimensionSatisfied(
          readiness,
          readinessDecisionDimension,
        );
      },
    );
  }

  /**
   * Return one blocker summary when critical system-partition rebalancing
   * should wait for cluster topology convergence.
   *
   * A joining or restarting cluster should not start background system-table
   * redistribution while nodes are still progressing through non-terminal
   * membership states, while endpoint publication is incomplete, or while
   * control-plane topology operations are still in flight. Hard failures
   * remain actionable and do not block.
   *
   * @return {Object|null}
   * @private
   */
  getCriticalSystemTopologySettlingBlocker() {
    if (!this.isSystemPartitionEntity()) {
      return null;
    }
    const nodeRows = typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
      this.systemTableCache.getAll(SYSTEM_TABLE_NAME.NODES) :
      [];
    if (!Array.isArray(nodeRows) || nodeRows.length === 0) {
      return null;
    }

    let hasTransitionalNode = false;
    let hasFailedNode = false;
    const bypassPriorityStartupReadiness =
      this.shouldBypassLocalPriorityControlPlaneStartupReadiness();
    const readinessDecisionDimension =
      this.resolveNodeReadinessDecisionDimension();
    const activeMembershipNodeIds = [];
    const activeNodeIds = [];
    const unreadyNodeIds = [];
    for (const nodeRow of nodeRows) {
      const normalizedNode = normalizeNodeRow(nodeRow);
      const {status, nodeId} = normalizedNode;
      if (!status) {
        continue;
      }
      if (status === NodeStatus.FAILED) {
        hasFailedNode = true;
        continue;
      }
      if (status !== NodeStatus.ACTIVE || nodeId.length === 0) {
        hasTransitionalNode = true;
        if (nodeId.length > 0) {
          unreadyNodeIds.push(nodeId);
        }
        continue;
      }
      activeMembershipNodeIds.push(nodeId);
      const readiness = this.controlPlaneReadinessService &&
        typeof this.controlPlaneReadinessService.getNodeReadinessSync ===
          TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.getNodeReadinessSync(
          nodeId,
          {
            allowStaleOnCacheChange: false,
          },
        ) :
        null;
      const nodeMembershipReady = this.isReadinessDimensionSatisfied(
        readiness,
        readinessDecisionDimension,
      );
      const localPriorityStartupLeaseClear =
        bypassPriorityStartupReadiness &&
        nodeId === this.nodeId &&
        isNodeReadyLeaseExplicitlyCleared(nodeRow, {
          requireActiveStatus: true,
        });
      if (localPriorityStartupLeaseClear) {
        activeNodeIds.push(nodeId);
        continue;
      }
      if (!nodeMembershipReady) {
        hasTransitionalNode = true;
        unreadyNodeIds.push(nodeId);
        continue;
      }
      activeNodeIds.push(nodeId);
    }

    if (hasTransitionalNode && !hasFailedNode) {
      const requiredHealthyNodeCount =
        this.resolveCriticalSystemRequiredHealthyNodeCount(
          activeMembershipNodeIds.length,
        );
      const hasRequiredHealthyNodes =
        activeNodeIds.length >= requiredHealthyNodeCount;
      if (this.isControlPlanePriorityPartition() && hasRequiredHealthyNodes) {
        // Priority spread may proceed once quorum is ready; additional ACTIVE
        // nodes can still be converging without stalling every priority table.
      } else {
        return Object.freeze({
          reason: unreadyNodeIds.length > 0 ?
            CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON
              .NODE_READY_LEASE_INCOMPLETE :
            CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON
              .TRANSITIONAL_NODE_MEMBERSHIP,
          unreadyNodeIds: Object.freeze([...unreadyNodeIds]),
          requiredHealthyNodeCount,
          healthyNodeCount: activeNodeIds.length,
          activeMembershipNodeCount: activeMembershipNodeIds.length,
        });
      }
    }

    const connectedNodeIds = this.resolveConnectedClusterNodeIds();
    if (connectedNodeIds.size > 0) {
      const knownNodeIds = new Set(nodeRows.map((nodeRow) => {
        return normalizeNodeRow(nodeRow).nodeId;
      }).filter((nodeId) =>
        typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
      ));
      const requiredHealthyNodeCount =
        this.resolveCriticalSystemRequiredHealthyNodeCount(
          activeMembershipNodeIds.length,
        );
      const hasRequiredHealthyNodes =
        activeNodeIds.length >= requiredHealthyNodeCount;
      const publishedActiveNodeIds =
        this.isControlPlanePriorityPartition() && hasRequiredHealthyNodes ?
          this.getPublishedActiveNodeIdSet() :
          null;
      for (const connectedNodeId of connectedNodeIds) {
        if (knownNodeIds.has(connectedNodeId)) {
          continue;
        }
        if (publishedActiveNodeIds &&
            !publishedActiveNodeIds.has(connectedNodeId)) {
          continue;
        }
        return Object.freeze({
          reason:
            CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON
              .TRANSPORT_MEMBERSHIP_EXCEEDS_NODES_CACHE,
          connectedNodeId,
        });
      }
    }

    const endpointVisibility =
      this.evaluateCriticalSystemEndpointVisibility(activeNodeIds);
    if (endpointVisibility.ready !== true) {
          return Object.freeze({
            reason:
              CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON
                .ENDPOINT_VISIBILITY_INCOMPLETE,
            ...endpointVisibility,
          });
    }

    const inFlightTopologyOperations =
      this.collectCriticalSystemInFlightReplicaOperations(
        activeNodeIds,
        {
          // Topology settling should only wait on in-flight operations that
          // mutate this same entity. Unrelated critical-system operations must
          // not serialize every other partition behind one active move.
          scopeToEntity: true,
        },
      );
    if (inFlightTopologyOperations.count > NUM.ZERO) {
      return Object.freeze({
        reason:
          CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON
            .TOPOLOGY_OPERATIONS_IN_FLIGHT,
        activeNodeIds: Object.freeze([...activeNodeIds]),
        inFlightReplicaOperations: inFlightTopologyOperations.count,
        inFlightReplicaOperationDetails: inFlightTopologyOperations.details,
        inFlightReplicaOperationsSource:
          inFlightTopologyOperations.source || null,
      });
    }

    return null;
  }

  /**
   * Return true when critical system-partition rebalancing should wait for
   * topology convergence.
   *
   * @return {boolean}
   * @private
   */
  isCriticalSystemTopologySettling() {
    return this.getCriticalSystemTopologySettlingBlocker() !== null;
  }

  /**
   * Revalidate in-flight topology blockers with authoritative entity
   * operations to avoid stale cache observations deadlocking planning.
   *
   * @param {Object|null} blocker
   * @return {Promise<Object|null>}
   * @private
   */
  async revalidateCriticalSystemTopologySettlingBlocker(blocker) {
    if (!blocker ||
        blocker.reason !==
          CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON
            .TOPOLOGY_OPERATIONS_IN_FLIGHT) {
      return blocker;
    }
    if (blocker.inFlightReplicaOperationsSource ===
      TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE.AUTHORITATIVE) {
      return blocker;
    }
    if (!this.rebalanceCoordinator ||
        typeof this.rebalanceCoordinator.getOperationsByEntity !==
          TYPEOF.FUNCTION) {
      return blocker;
    }

    let entityOperations = [];
    try {
      entityOperations = await this.rebalanceCoordinator.getOperationsByEntity(
        this.entityType,
        this.entityId,
      );
    } catch (error) {
      this.logger.warn(
        REBALANCER_LOG_MSG.REVALIDATE_TOPOLOGY_BLOCKER_FAILED,
        {
          entityId: this.entityId,
          entityType: this.entityType,
          reason: blocker.reason || null,
          error: error?.message || String(error),
        },
      );
      return blocker;
    }

    const activeNodeIds = new Set(
      (Array.isArray(blocker.activeNodeIds) ? blocker.activeNodeIds : [])
        .filter((nodeId) =>
          typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
        ),
    );
    const inFlightDetails = [];
    const nowMs = Date.now();
    for (const operation of entityOperations) {
      if (!this.isTopologySettlingInFlightOperation(operation, {nowMs}) ||
          !this.isOperationForEntity(operation)) {
        continue;
      }
      const detail =
        this.buildCriticalSystemInFlightReplicaOperationDetail(operation);
      if (!detail.targetNodeId) {
        continue;
      }
      if (activeNodeIds.size > NUM.ZERO &&
          !activeNodeIds.has(detail.targetNodeId)) {
        continue;
      }
      inFlightDetails.push(detail);
    }

    if (inFlightDetails.length === NUM.ZERO) {
      return null;
    }

    return Object.freeze({
      ...blocker,
      inFlightReplicaOperations: inFlightDetails.length,
      inFlightReplicaOperationDetails: Object.freeze(inFlightDetails),
      inFlightReplicaOperationsSource:
        TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE.AUTHORITATIVE,
    });
  }

  /**
   * Return a blocker summary when non-system entities should yield until the
   * startup-critical control-plane partitions are spread across ready nodes.
   *
   * This keeps user/data-plane rebalancing from consuming the global
   * rebalancer budget while the seed is still the only owner of the control
   * plane write path.
   *
   * @return {Object|null}
   * @private
   */
  getControlPlanePrioritySpreadBlocker() {
    if (this.isSystemPartitionEntity()) {
      return null;
    }

    const publicationRow = this.getLatestPublishedMembershipRow();
    const priorityPartitionSummary =
      publicationRow?.priorityPartitionSummary ??
      publicationRow?.priority_partition_summary ??
      null;
    if (!priorityPartitionSummary ||
        typeof priorityPartitionSummary !== TYPEOF.OBJECT ||
        priorityPartitionSummary.satisfied !== false) {
      return null;
    }

    const readyNodes = this.getAvailableNodes();
    const readyNodeIds = new Set(
      readyNodes
        .map((node) => node?.node_id || node?.nodeId || '')
        .filter(Boolean),
    );
    const requiredDistinctNodeCount = Math.min(NUM.THREE, readyNodeIds.size);
    if (requiredDistinctNodeCount <= NUM.ONE) {
      return null;
    }

    const summaryBlockedPartitions = Array.isArray(
      priorityPartitionSummary.blockedPartitions,
    ) ? priorityPartitionSummary.blockedPartitions : [];
    const summaryMissingPartitionIds = Array.isArray(
      priorityPartitionSummary.missingPartitionIds,
    ) ? priorityPartitionSummary.missingPartitionIds : [];
    const blockedPartitions = summaryBlockedPartitions.length > NUM.ZERO ?
      summaryBlockedPartitions.map((partition) => {
        const partitionId = String(partition?.partitionId || '');
        const readyReplicaCount = Number.isFinite(
          partition?.readyReplicaCount,
        ) ? partition.readyReplicaCount : null;
        const readyDistinctNodeCount = Number.isFinite(
          partition?.readyDistinctNodeCount,
        ) ? partition.readyDistinctNodeCount : null;
        const spreadGap = Number.isFinite(partition?.spreadGap) ?
          partition.spreadGap : null;
        return Object.freeze({
          partitionId,
          readyReplicaCount,
          readyDistinctNodeCount,
          spreadGap,
        });
      }).filter((partition) => partition.partitionId.length > NUM.ZERO) :
      summaryMissingPartitionIds.map((partitionId) => Object.freeze({
        partitionId: String(partitionId || ''),
        readyReplicaCount: null,
        readyDistinctNodeCount: null,
        spreadGap: null,
      })).filter((partition) => partition.partitionId.length > NUM.ZERO);

    return Object.freeze({
      requiredDistinctNodeCount,
      blockedPartitions: Object.freeze(blockedPartitions),
    });
  }

  /**
   * Resolve live cluster peers from the message router plus the local node.
   * When transport shows peers that the nodes table does not yet publish,
   * system-topology background work should continue to treat the cluster as
   * settling.
   * @return {Set<string>}
   * @private
   */
  resolveConnectedClusterNodeIds() {
    const connectedNodeIds = new Set();
    if (typeof this.nodeId === TYPEOF.STRING && this.nodeId.length > 0) {
      connectedNodeIds.add(this.nodeId);
    }
    const peers = typeof this.messageRouter?.getConnectedNodes === TYPEOF.FUNCTION ?
      this.messageRouter.getConnectedNodes() :
      [];
    for (const peerNodeId of peers) {
      if (typeof peerNodeId === TYPEOF.STRING && peerNodeId.length > 0) {
        connectedNodeIds.add(peerNodeId);
      }
    }
    return connectedNodeIds;
  }

  /**
   * Return one endpoint visibility summary for ACTIVE cluster members.
   * @param {string[]} activeNodeIds
   * @return {{
   *   ready: boolean,
   *   missingNodeEndpointNodeIds: string[],
   *   missingPostgresWireNodeIds: string[],
   * }}
   * @private
   */
  evaluateCriticalSystemEndpointVisibility(activeNodeIds = []) {
    const requiredNodeIds = Array.isArray(activeNodeIds) ?
      activeNodeIds.filter((nodeId) =>
        typeof nodeId === TYPEOF.STRING && nodeId.length > 0,
      ) :
      [];
    if (requiredNodeIds.length === NUM.ZERO) {
      return Object.freeze({
        ready: false,
        missingNodeEndpointNodeIds: [],
        missingPostgresWireNodeIds: [],
      });
    }

    const nodeEndpointRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) :
        [];
    const serviceEndpointRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS) :
        [];
    const visibleNodeEndpointNodeIds = new Set();
    const visiblePostgresWireNodeIds = new Set();

    for (const row of nodeEndpointRows) {
      const normalizedRow = normalizeNodeEndpointRow(row);
      const {nodeId, status, transportType} = normalizedRow;
      if (!nodeId ||
          status !== String(ENDPOINT_STATUS.ACTIVE).toLowerCase() ||
          transportType !== String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase()) {
        continue;
      }
      visibleNodeEndpointNodeIds.add(nodeId);
    }

    for (const row of serviceEndpointRows) {
      const normalizedRow = normalizeServiceEndpointRow(row);
      const {nodeId, serviceId, healthStatus} = normalizedRow;
      if (!nodeId ||
          serviceId !== META_SERVICE_ID.POSTGRES_WIRE ||
          healthStatus !== String(ENDPOINT_SYNC_HEALTH.HEALTHY).toLowerCase()) {
        continue;
      }
      visiblePostgresWireNodeIds.add(nodeId);
    }

    const missingNodeEndpointNodeIds = requiredNodeIds.filter((nodeId) =>
      !visibleNodeEndpointNodeIds.has(nodeId),
    );
    const missingPostgresWireNodeIds = requiredNodeIds.filter((nodeId) =>
      !visiblePostgresWireNodeIds.has(nodeId),
    );
    return Object.freeze({
      ready: missingNodeEndpointNodeIds.length === NUM.ZERO &&
        missingPostgresWireNodeIds.length === NUM.ZERO,
      missingNodeEndpointNodeIds,
      missingPostgresWireNodeIds,
    });
  }

  /**
   * Normalize one in-flight replica operation for topology diagnostics.
   * @param {Object} row
   * @return {Object}
   * @private
   */
  buildCriticalSystemInFlightReplicaOperationDetail(row) {
    const operationId = row?.operation_id || row?.operationId || null;
    const type = row?.type || null;
    const partitionId =
      row?.partition_group_id ||
      row?.partitionGroupId ||
      row?.partition_id ||
      row?.partitionId ||
      null;
    const targetNodeId = String(
      row?.target_node_id || row?.targetNodeId || '',
    );
    const status = row?.status ||
      String(row?.status || '').toLowerCase() ||
      null;
    const workflowStep = row?.workflow_step || row?.workflowStep || null;

    return Object.freeze({
      operationId,
      type,
      partitionId,
      targetNodeId,
      status,
      workflowStep,
    });
  }

  /**
   * Return non-terminal replica operations that still indicate topology churn
   * for already-ACTIVE nodes.
   * @param {string[]} activeNodeIds
   * @return {{count:number,details:Object[]}}
   * @private
   */
  collectCriticalSystemInFlightReplicaOperations(
    activeNodeIds = [],
    options = {},
  ) {
    const requiredNodeIds = new Set(
      (Array.isArray(activeNodeIds) ? activeNodeIds : []).filter((nodeId) =>
        typeof nodeId === TYPEOF.STRING && nodeId.length > 0,
      ),
    );
    const scopeToEntity = options.scopeToEntity === true;
    if (requiredNodeIds.size === NUM.ZERO ||
        typeof this.systemTableCache?.getAll !== TYPEOF.FUNCTION) {
      return Object.freeze({
        count: NUM.ZERO,
        details: Object.freeze([]),
        source: null,
      });
    }

    const rows = this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [];
    const nowMs = Date.now();
    const details = [];
    for (const row of rows) {
      if (!this.isTopologySettlingInFlightOperation(row, {nowMs})) {
        continue;
      }
      if (scopeToEntity && !this.isOperationForEntity(row)) {
        continue;
      }
      const detail =
        this.buildCriticalSystemInFlightReplicaOperationDetail(row);
      const {targetNodeId} = detail;
      if (!targetNodeId || !requiredNodeIds.has(targetNodeId)) {
        continue;
      }
      details.push(detail);
    }

    return Object.freeze({
      count: details.length,
      details: Object.freeze(details),
      source: TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE.CACHE,
    });
  }

  /**
   * Return one local readiness snapshot when critical system-partition
   * planning should wait for this leader to become serve-eligible.
   *
   * Background redistribution of seed-hosted system partitions fans out many
   * control-plane reads and writes. During join/restart convergence, a leader
   * that is not yet serve-eligible should not initiate that background work,
   * even though repair-eligible topology operations remain valid elsewhere.
   *
   * @return {Object|null}
   * @private
   */
  getCriticalSystemLocalServeReadinessBlocker() {
    if (!this.isSystemPartitionEntity() ||
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService.getNodeReadinessSync !==
          TYPEOF.FUNCTION) {
      return null;
    }
    if (this.shouldBypassLocalPriorityControlPlaneStartupReadiness()) {
      return null;
    }
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      this.nodeId,
      {
        allowStaleOnCacheChange: false,
      },
    );
    if (!readiness?.dimensions ||
        readiness.dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE
        ] === true) {
      return null;
    }
    return readiness;
  }

  /**
   * Return one local readiness snapshot when background topology mutation
   * should wait for the local metadata publication contract to recover.
   *
   * @return {Object|null}
   * @private
   */
  getLocalControlPlaneMutationReadinessBlocker() {
    const requiredDimensions =
      this.shouldBypassLocalPriorityControlPlaneStartupReadiness() ?
        [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY] :
        null;
    return getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.nodeId,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      requiredDimensions,
      requirePublishedConvergence: !this.isControlPlanePriorityPartition(),
    });
  }

  /**
   * Return the latest bootstrap readiness snapshot when available.
   *
   * @return {Object|null}
   * @private
   */
  getBootstrapReadinessSnapshot() {
    if (this.startupRecoveryCoordinator &&
        typeof this.startupRecoveryCoordinator.getSnapshot ===
          TYPEOF.FUNCTION) {
      return this.startupRecoveryCoordinator.getSnapshot();
    }
    if (!this.bootstrapReadinessState) {
      return null;
    }
    return typeof this.bootstrapReadinessState.evaluate === TYPEOF.FUNCTION ?
      this.bootstrapReadinessState.evaluate() :
      (typeof this.bootstrapReadinessState.getSnapshot === TYPEOF.FUNCTION ?
        this.bootstrapReadinessState.getSnapshot() :
        null);
  }

  /**
   * Check whether lifecycle has opened background work for this entity.
   *
   * @param {Object|null} snapshot - Bootstrap readiness snapshot.
   * @return {boolean}
   * @private
   */
  isBootstrapReadinessOpenForBackgroundWork(snapshot) {
    if (this.startupRecoveryCoordinator &&
        typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION) {
      return this.startupRecoveryCoordinator.evaluate({
        partitionId: this.entityId,
        snapshot,
      }).backgroundWorkReady === true;
    }
    return isBackgroundWorkLifecycleReadySnapshot(snapshot, {
      partitionId: this.entityId,
    });
  }

  /**
   * Priority control-plane partitions may recover through the local seed's
   * startup quarantine once lifecycle has opened metadata publication, even
   * before the seed becomes serve-eligible again.
   *
   * @return {boolean}
   * @private
   */
  shouldBypassLocalPriorityControlPlaneStartupReadiness() {
    if (this.startupRecoveryCoordinator &&
        typeof this.startupRecoveryCoordinator.evaluate === TYPEOF.FUNCTION) {
      return this.startupRecoveryCoordinator.evaluate({
        partitionId: this.entityId,
      }).shouldBypassLocalPriorityControlPlaneStartupReadiness === true;
    }
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    const snapshot = this.getBootstrapReadinessSnapshot();
    if (!this.isBootstrapReadinessOpenForBackgroundWork(snapshot)) {
      return false;
    }
    return !(
      snapshot?.ready === true &&
      snapshot?.phase === LIFECYCLE_PHASE.TRAFFIC_READY
    );
  }

  /**
   * Return one bootstrap lifecycle snapshot when critical system-partition
   * planning should wait for the lifecycle owner to open background work.
   *
   * `BootstrapReadinessState` is the canonical owner for startup/join/traffic
   * lifecycle. Most system redistribution should wait for `TRAFFIC_READY`,
   * but the priority control-plane partitions are allowed once metadata
   * publication is open because they are required to complete restart/join
   * convergence under load.
   *
   * @return {Object|null}
   * @private
   */
  getCriticalSystemTrafficReadinessBlocker() {
    if (!this.isSystemPartitionEntity() ||
        !this.bootstrapReadinessState) {
      return null;
    }

    const snapshot = this.getBootstrapReadinessSnapshot();
    if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
      return null;
    }
    if (this.isBootstrapReadinessOpenForBackgroundWork(snapshot)) {
      return null;
    }
    return snapshot;
  }

  /**
   * Check if a node is ready to receive replica operations.
   * @param {string} nodeId - Node ID.
   * @return {Promise<boolean>} True if ready.
   */
  async isNodeReady(nodeId) {
    const readinessDecisionDimension =
      this.resolveNodeReadinessDecisionDimension();
    const readiness = this.controlPlaneReadinessService
      .getNodeReadinessSync(nodeId, {
        decisionDimension:
          readinessDecisionDimension,
      });
    if (!this.isReadinessDimensionSatisfied(
      readiness,
      readinessDecisionDimension,
    )) {
      return false;
    }

    // Delegate transport-level checks (connection, outbound queue, and
    // optional ping) to the canonical readiness policy owner.
    return isNodeReadyWithTransport({
      nodeId,
      systemTableCache: this.systemTableCache,
      messageRouter: this.messageRouter,
      requireOutboundQueue: true,
      enableReadinessPing: this.enableReadinessPing,
      readinessPingTimeoutMs: this.readinessPingTimeoutMs,
    });
  }

  /**
   * Thin adapter: check transport-level reachability for a node.
   * Delegates to node-readiness-policy isNodeReadyWithTransport with
   * rebalancer-specific defaults (outbound queue required, no ping).
   * Kept for API compatibility; the main readiness path (isNodeReady)
   * calls the policy owner directly.
   * @param {string} nodeId - Node ID.
   * @return {boolean} True when transport is ready.
   */
  isTransportReady(nodeId) {
    const router = this.messageRouter;
    if (!router || typeof router.getConnectionState !== TYPEOF.FUNCTION) {
      return false;
    }

    if (router.getConnectionState(nodeId) !== STATE.CONNECTED) {
      return false;
    }

    if (typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION &&
        !router.isOutboundQueueAvailable(nodeId)) {
      return false;
    }

    return true;
  }

  /**
   * Thin adapter: perform an optional readiness ping via the policy
   * owner. Composes isNodeReadyWithTransport with ping enabled and
   * rebalancer-specific timeout.
   * Kept for API compatibility; the main readiness path (isNodeReady)
   * calls the policy owner directly.
   * @param {string} nodeId - Node ID.
   * @return {Promise<boolean>} True when ping succeeds.
   */
  async checkReadinessPing(nodeId) {
    const router = this.messageRouter;
    if (!router || typeof router.pingNode !== TYPEOF.FUNCTION) {
      return true;
    }

    const pingTimeout = Number.isFinite(this.readinessPingTimeoutMs) ?
      this.readinessPingTimeoutMs :
      NUM.ZERO;
    return router.pingNode(nodeId, pingTimeout);
  }

  /**
   * Determine the specific readiness skip reason for a node.
   * Checks each readiness dimension in order and returns the first
   * failing reason, preserving granularity for diagnostics
   * (Requirement 5.3, Design D6.3).
   *
   * @param {string} nodeId - Node ID.
   * @return {Promise<string|null>} Skip detail from
   *   READINESS_SKIP_DETAIL, or null when node is ready.
   */
  async getNodeReadinessSkipReason(nodeId) {
    if (await this.isNodeReady(nodeId)) {
      return null;
    }

    const readinessDecisionDimension =
      this.resolveNodeReadinessDecisionDimension();
    const readiness = this.controlPlaneReadinessService
      .getNodeReadinessSync(nodeId, {
        decisionDimension:
          readinessDecisionDimension,
      });
    if (!this.isReadinessDimensionSatisfied(
      readiness,
      readinessDecisionDimension,
    )) {
      // Determine whether the rejection is lease or status.
      const nodeRow = this.systemTableCache.get(
        TABLES.NODES, nodeId,
      );
      if (!nodeRow) {
        return READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE;
      }
      if (nodeRow.status !== SERVICE_STATUS.ACTIVE) {
        return READINESS_SKIP_DETAIL.STATUS_NOT_ACTIVE;
      }
      const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
      if (!Number.isFinite(leaseExpiry) || leaseExpiry <= Date.now()) {
        return READINESS_SKIP_DETAIL.LEASE_EXPIRED;
      }
      return READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE;
    }

    // Record-level checks passed; check transport dimensions.
    const router = this.messageRouter;
    if (!router || typeof router.getConnectionState !== TYPEOF.FUNCTION) {
      return READINESS_SKIP_DETAIL.CONNECTION_DOWN;
    }
    if (router.getConnectionState(nodeId) !== STATE.CONNECTED) {
      return READINESS_SKIP_DETAIL.CONNECTION_DOWN;
    }

    if (typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION &&
        !router.isOutboundQueueAvailable(nodeId)) {
      return READINESS_SKIP_DETAIL.OUTBOUND_QUEUE_UNAVAILABLE;
    }

    if (this.enableReadinessPing &&
        typeof router.pingNode === TYPEOF.FUNCTION) {
      const pingTimeout = Number.isFinite(this.readinessPingTimeoutMs) ?
        this.readinessPingTimeoutMs :
        NUM.ZERO;
      const ok = await router.pingNode(nodeId, pingTimeout);
      if (!ok) {
        return READINESS_SKIP_DETAIL.PING_FAILED;
      }
    }

    return READINESS_SKIP_DETAIL.REPAIR_INELIGIBLE;
  }

  /**
   * Get current replicas for this entity.
   * @readModel REBALANCE_CURRENT_REPLICAS — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @return {Array<Object>} Array of replica objects.
   */
  getCurrentReplicas() {
    if (this.entityType === EntityType.MESSAGE_GROUP) {
      return this.systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES, (service) => {
          const normalizedService = normalizeServiceRow(service);
          return normalizedService.groupId === this.entityId &&
            normalizedService.serviceType === EntityType.MESSAGE_GROUP;
        });
    }

    // For runtime services, match by service_type and service_id
    // that equals or is prefixed by the entity (definition) ID.
    if (this.entityType === EntityType.RUNTIME_SERVICE) {
      return this.systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES, (service) => {
          const normalizedService = normalizeServiceRow(service);
          return normalizedService.serviceType ===
            EntityType.RUNTIME_SERVICE &&
            normalizedService.serviceId === this.entityId;
        });
    }

    // For partitions, get services with matching partition_id
    return this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.SERVICES, (service) => {
        const normalizedService = normalizeServiceRow(service);
        return normalizedService.partitionId === this.entityId &&
          normalizedService.serviceType === EntityType.PARTITION;
      });
  }

  /**
   * Check if an operation row targets this rebalancer entity.
   * @param {Object} operation - replica_operations row.
   * @return {boolean} True when operation matches this entity.
   * @private
   */
  isOperationForEntity(operation) {
    const entityType =
      operation?.entity_type ||
      operation?.entityType ||
      EntityType.PARTITION;
    const entityId =
      operation?.entity_id ||
      operation?.entityId ||
      operation?.partition_group_id ||
      operation?.partitionGroupId ||
      operation?.partition_id ||
      operation?.partitionId ||
      null;
    return entityType === this.entityType && entityId === this.entityId;
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isTrackedInFlightOperation(operation) {
    const operationType =
      operation?.type ||
      operation?.operation_type ||
      operation?.operationType ||
      null;
    if (operationType &&
        !isCoordinatorOwnedOperationType(operationType)) {
      return false;
    }
    return !TERMINAL_STATUSES.includes(
      String(operation?.status || '').toLowerCase(),
    );
  }

  /**
   * @param {Object} operation
   * @param {Object} options
   * @return {boolean}
   * @private
   */
  isTopologySettlingInFlightOperation(operation, options = {}) {
    const nowMs = Number.isFinite(options.nowMs) ?
      Math.floor(options.nowMs) :
      Date.now();
    const normalizedOperation = normalizeReplicaOperationRecord(
      operation,
      {nowMs},
    );
    if (!isReplicaOperationInFlight(normalizedOperation)) {
      return false;
    }
    return !isReplicaOperationStale(normalizedOperation, {nowMs});
  }

  /**
   * Get in-flight replica operations for this entity.
   * @readModel REBALANCE_IN_FLIGHT_OPERATIONS —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @return {Array<Object>} Array of replica_operations rows in-flight.
   */
  getInFlightOperations() {
    return this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      (operation) => {
        if (!this.isTrackedInFlightOperation(operation)) {
          return false;
        }
        return this.isOperationForEntity(operation);
      },
    );
  }

  /**
   * Resolve pressure and delivery options for authoritative budget reads.
   * Startup-critical and critical system partitions must keep these reads on
   * the critical path so transport pressure does not strand control-plane
   * spread behind background gating queries.
   *
   * @return {Object} Gateway query options.
   */
  getBudgetQueryOptions() {
    const criticalQuery = this.isControlPlanePriorityPartition() ||
      this.isCriticalSystemPartition();
    return {
      controlPlaneOperationKind: 'read',
      workClass: criticalQuery ?
        PRESSURE_WORK_CLASS.CRITICAL :
        PRESSURE_WORK_CLASS.BACKGROUND,
      allowPressureDefer: criticalQuery !== true,
      deliveryPriority: criticalQuery ? 'critical' : 'background',
    };
  }

  /**
     * Query the configured rebalance budget from authoritative config.
     * Returns the constructor-provided default when the config row
     * is absent or unparseable — this is a default, not a mixed read model.
     *
     * @readModel REBALANCE_CONFIGURED_BUDGET — READ_MODEL_SOURCE.AUTHORITATIVE_SQL
     * @return {Promise<number>} Configured rebalance budget.
     */
    async getConfiguredRebalanceBudget() {
      const result = await this.controlPlaneSystemTableGateway.executeQuery(
        SQL_BUDGET.SELECT_REBALANCE_BUDGET,
        [REBALANCER_CONFIG_KEY.REBALANCE_BUDGET],
        {
          controlPlaneTableName: SYSTEM_TABLE_NAME.CONFIG,
          ...this.getBudgetQueryOptions(),
        },
      );

      if (!result.success || !result.rows || result.rows.length === 0) {
        return this.rebalanceBudget;
      }

      const parsed = Number(result.rows[0].config_value);
      return Number.isFinite(parsed) && parsed > 0 ?
        parsed : this.rebalanceBudget;
    }

  /**
     * Query the global in-flight operation count via authoritative SQL.
     *
     * @readModel REBALANCE_GLOBAL_BUDGET — READ_MODEL_SOURCE.AUTHORITATIVE_SQL
     * @return {Promise<number>} In-flight operation count.
     */
    async getGlobalInFlightOperationCount() {
      const result = await this.controlPlaneSystemTableGateway.executeQuery(
        SQL_BUDGET.SELECT_IN_FLIGHT_COUNT,
        [],
        {
          controlPlaneTableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          ...this.getBudgetQueryOptions(),
        },
      );

      if (!result.success || !result.rows || result.rows.length === 0) {
        return 0;
      }

      const parsed = Number(result.rows[0].total_count);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }

  /**
   * Return true when one move set contains add-like work that can advance
   * priority control-plane spread.
   * @param {Array<Object>} moves
   * @return {boolean}
   * @private
   */
  hasPriorityBudgetBypassCandidateMove(moves = []) {
    if (!Array.isArray(moves) || moves.length === NUM.ZERO) {
      return false;
    }
    return moves.some((move) => move?.type === MoveType.ADD ||
      move?.type === MoveType.REPLACE);
  }

  /**
   * Priority control-plane spread must not deadlock behind unrelated in-flight
   * operations that saturate the global move budget. Use the coordinator's
   * dedicated priority add lane to decide whether one recovery move may still
   * proceed.
   *
   * @param {Array<Object>} moves
   * @return {Promise<boolean>}
   * @private
   */
  async canBypassGlobalBudgetForPriorityRecovery(moves = []) {
    if (!this.isControlPlanePriorityPartition()) {
      return false;
    }
    if (!this.hasPriorityBudgetBypassCandidateMove(moves)) {
      return false;
    }
    if (!this.rebalanceCoordinator ||
        typeof this.rebalanceCoordinator.canStartPriorityAddOperation !==
          TYPEOF.FUNCTION) {
      return false;
    }
    const allowed = await this.rebalanceCoordinator
      .canStartPriorityAddOperation(
        PRIORITY_BUDGET_BYPASS_COORDINATOR_OPTIONS,
      );
    return allowed === true;
  }

  /**
   * Check whether this rebalancer targets a critical system partition.
   * @return {boolean} True when entity is a critical system partition.
   * @private
   */
  isCriticalSystemPartition() {
    return this.isSystemPartitionEntity();
  }

  /**
   * Get healthy replicas (excluding failed or removed).
   * @param {Array<Object>} replicas - All replicas.
   * @return {Array<Object>} Healthy replicas only.
   */
  getHealthyReplicas(replicas) {
    const activeReplicas = replicas.filter((replica) => {
      const status = replica.status || ReplicaStatus.ACTIVE;
      return status === ReplicaStatus.ACTIVE;
    });

    // Align critical-partition health semantics with coordinator safety checks:
    // consider only routable non-learner replicas on ready nodes as healthy.
    if (!this.isCriticalSystemPartition()) {
      return activeReplicas;
    }

    const readyNodeIds = new Set(
      this.getAvailableNodes().map((node) => node.node_id),
    );

    return activeReplicas.filter((replica) => {
      if (!replica?.node_id || !replica?.address) {
        return false;
      }
      const role = typeof replica.raft_role === 'string' ?
        replica.raft_role.toLowerCase() :
        null;
      if (!role || role === RAFT_ROLE.LEARNER) {
        return false;
      }
      return readyNodeIds.has(replica.node_id);
    });
  }

  /**
   * Calculate target state based on policy.
   * @param {Array<Object>} currentReplicas - Current replica state.
   * @param {Object} policy - Applicable policy.
   * @return {Object} Target state with replica count and placement.
   */
  async calculateTargetState(currentReplicas, policy) {
    return this.movePlanner.calculateTargetState(currentReplicas, policy);
  }

  /**
   * Calculate optimal placement for message groups.
   * Ensures every node has at least one local replica.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Message group policy.
   * @return {Object} Target placement state.
   */
  calculateMessageGroupPlacement(nodes, targetCount, policy) {
    return this.movePlanner.calculateMessageGroupPlacement(
      nodes,
      targetCount,
      policy,
    );
  }

  /**
   * Calculate optimal placement for partitions.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Table policy.
   * @return {Object} Target placement state.
   */
  calculatePartitionPlacement(nodes, targetCount, policy) {
    return this.movePlanner.calculatePartitionPlacement(nodes, targetCount, policy);
  }

  /**
   * Sort nodes by current load (prefer less loaded nodes).
   * @param {Array<Object>} nodes - Available nodes.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesByLoad(nodes) {
    return this.movePlanner.sortNodesByLoad(nodes);
  }

  /**
   * Sort nodes by suitability based on policy constraints.
   * @param {Array<Object>} nodes - Available nodes.
   * @param {Object} policy - Policy with placement constraints.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesBySuitability(nodes, policy) {
    return this.movePlanner.sortNodesBySuitability(nodes, policy);
  }

  /**
   * Calculate node load score.
   * @param {Object} node - Node object.
   * @return {number} Load score (0-300, lower is better).
   */
  calculateNodeLoad(node) {
    return this.movePlanner.calculateNodeLoad(node);
  }


  /**
   * Calculate moves needed to reach target state.
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} targetState - Target state.
   * @return {Array<Object>} Array of move operations.
   */
  calculateMoves(currentReplicas, targetState) {
    return this.movePlanner.calculateMoves(currentReplicas, targetState);
  }

  /**
   * Execute a single move operation via the coordinator.
   * Requirements: 2.5
   * @param {Object} move - Move operation to execute.
   * @return {Promise<Object>} Result of the move.
   */
  async executeMove(move) {
    if (this.isShuttingDown) {
      return {
        success: false,
        skipped: true,
        reason: 'shutdown_in_progress',
        operation: move?.type,
        nodeId: move?.nodeId,
        replicaId: move?.replicaId,
      };
    }

    this.logger.info(REBALANCER_LOG_MSG.EXECUTE_MOVE, {
      entityId: this.entityId,
      entityType: this.entityType,
      moveType: move.type,
      nodeId: move.nodeId,
      reason: move.reason,
      usingCoordinator: !!this.rebalanceCoordinator,
    });

    try {
      if (move?.nodeId) {
        const skipDetail =
          await this.getNodeReadinessSkipReason(move.nodeId);
        if (skipDetail !== null) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_UNREADY_NODE, {
            entityId: this.entityId,
            nodeId: move.nodeId,
            moveType: move.type,
            skipDetail,
          });
          return {
            success: false,
            skipped: true,
            reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
            skipDetail,
            operation: move.type,
            nodeId: move.nodeId,
            replicaId: move.replicaId,
          };
        }
      }

      if (!this.rebalanceCoordinator) {
        throw new Error(REBALANCER_ERROR_MSG.COORDINATOR_REQUIRED);
      }

      const outcome = await this.executeMoveViaCoordinator(move);
      if (outcome?.skipped === true) {
        const admissionBlockingReasonCodes = Array.isArray(
          outcome?.admission?.blockingReasons,
        ) ?
          outcome.admission.blockingReasons
            .map((reason) => String(
              reason?.code ||
              reason?.reason ||
              reason ||
              '',
            ).trim())
            .filter((reason) => reason.length > NUM.ZERO) :
          [];
        this.logger.info(REBALANCER_LOG_MSG.MOVE_SKIPPED, {
          entityId: this.entityId,
          entityType: this.entityType,
          moveType: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId || null,
          reason: outcome.reason || null,
          error: outcome.error || null,
          admissionDecisionType:
            outcome?.admission?.decisionType || null,
          admissionReason: outcome?.admission?.reason || null,
          admissionBlockingReasonCodes,
        });
      }
      return outcome;
    } catch (error) {
      this.logger.error(REBALANCER_LOG_MSG.MOVE_FAILED, {
        entityId: this.entityId,
        moveType: move.type,
        nodeId: move.nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a move via the RebalanceCoordinator.
   * The coordinator owns operation state tracking.
   * Requirements: 2.5
   * @param {Object} move - Move operation to execute.
   * @return {Promise<Object>} Result of the move.
   * @private
   */
  async executeMoveViaCoordinator(move) {
    if (this.isShuttingDown) {
      return {
        success: false,
        skipped: true,
        reason: 'shutdown_in_progress',
        operation: move?.type,
        nodeId: move?.nodeId,
        replicaId: move?.replicaId,
      };
    }

    const safetyError =
      await this.rebalanceCoordinator.getMoveSafetyError({
        ...move,
        partitionId: move.partitionId || this.entityId,
        entityType: move.entityType || this.entityType,
        entityId: move.entityId || this.entityId,
      });
    if (safetyError) {
      this.logger.debug(REBALANCER_LOG_MSG.MOVE_BLOCKED_BY_SAFETY_POLICY, {
        entityId: this.entityId,
        entityType: this.entityType,
        partitionId: this.entityId,
        moveType: move.type,
        nodeId: move.nodeId,
        replicaId: move.replicaId,
        error: safetyError,
      });
      return {
        success: false,
        skipped: true,
        reason: REBALANCER_SKIP_REASON.SAFETY_BLOCKED,
        operation: move.type,
        nodeId: move.nodeId,
        replicaId: move.replicaId,
        error: safetyError,
      };
    }

    let operationType = null;
    if (move.type === MoveType.ADD) {
      operationType = OperationType.ADD;
    } else if (move.type === MoveType.REMOVE) {
      operationType = OperationType.REMOVE;
    } else if (move.type === MoveType.REPLACE) {
      operationType = OperationType.REPLACE;
    } else {
      throw new Error(`Unsupported move type: ${move.type}`);
    }

    const operationRequest = {
      type: operationType,
      partitionId: this.entityId,
      entityType: this.entityType,
      entityId: this.entityId,
      nodeId: move.nodeId,
      replicaId: move.replicaId,
      sourceNodeId: move.sourceNodeId,
      enforceConcurrentOperationBudget: true,
    };
    const membershipPublicationEpoch = Number.isInteger(
      move?.membershipPublicationEpoch,
    ) ? move.membershipPublicationEpoch :
      this.resolvePublishedMembershipPlanningEpoch();
    if (Number.isInteger(membershipPublicationEpoch) &&
        membershipPublicationEpoch >= 0) {
      operationRequest.membershipPublicationEpoch = membershipPublicationEpoch;
    }
    if (move?.controlPlaneMutationWorkClass) {
      operationRequest.controlPlaneMutationWorkClass =
        move.controlPlaneMutationWorkClass;
    }

    // Create operation record via coordinator.
    // Periodic planning already gates on local mutation readiness before
    // enqueueing moves, so direct move execution should only opt into
    // background mutation gating when the caller explicitly requests it.
    let operation = null;
    try {
      operation = await this.rebalanceCoordinator.createOperation(
        operationRequest,
      );
    } catch (error) {
      if (error?.rebalanceSkipReason) {
        return {
          success: false,
          skipped: true,
          reason: error.rebalanceSkipReason,
          operation: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId,
        };
      }
      if (error?.admissionResult) {
        return {
          success: false,
          skipped: true,
          reason:
            error.admissionResult.decisionType || 'admission_denied',
          operation: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId,
          admission: error.admissionResult,
        };
      }
      throw error;
    }

    return {
      success: true,
      replicaId: move.replicaId || operation.replicaId,
      nodeId: move.nodeId,
      operationId: operation.operationId,
      operation: move.type,
      status: 'scheduled',
    };
  }

  /**
   * Check if a replica has a pending move operation.
   * @param {string} replicaId - Replica ID to check.
   * @return {boolean} True if replica has pending move.
   */
  hasPendingMove(replicaId) {
    const inFlightOps = this.getInFlightOperations();
    if (inFlightOps.some((op) => op.replica_id === replicaId)) {
      return true;
    }
    return false;
  }

  /**
   * Check if a node has a pending ADD move for this entity.
   * @param {string} nodeId - Node ID to check.
   * @return {boolean} True if node has pending ADD move.
   */
  hasPendingAddForNode(nodeId) {
    const inFlightOps = this.getInFlightOperations();
    if (inFlightOps.some((op) =>
      op.target_node_id === nodeId &&
      (op.type === OperationType.ADD || op.type === OperationType.REPLACE),
    )) {
      return true;
    }
    return false;
  }

  /**
   * Group moves by target node ID.
   * @param {Array<Object>} moves - Move operations.
   * @return {Map<string|null, Array<Object>>} Grouped moves by node ID.
   * @private
   */
  groupMovesByTargetNode(moves) {
    const grouped = new Map();
    for (const move of moves) {
      const nodeId = move?.nodeId || null;
      if (!grouped.has(nodeId)) {
        grouped.set(nodeId, []);
      }
      grouped.get(nodeId).push(move);
    }
    return grouped;
  }

  /**
   * Execute move operations with per-node batching and backpressure.
   * @param {Array<Object>} moves - Move operations.
   * @return {Promise<Array<Object>>} Execution results.
   * @private
   */
  async executeRebalancingMoves(moves) {
    if (this.isShuttingDown) {
      return [];
    }

    const results = [];
    const batchSize = Number.isFinite(this.moveBatchSize) && this.moveBatchSize > 0 ?
      Math.floor(this.moveBatchSize) : 1;
    const interBatchDelayMs = Number.isFinite(this.interBatchDelayMs) &&
      this.interBatchDelayMs > 0 ? this.interBatchDelayMs : 0;
    const readinessByNodeId = new Map();
    const getSkipReasonCached = async (nodeId) => {
      if (!nodeId) {
        return null;
      }
      if (readinessByNodeId.has(nodeId)) {
        return readinessByNodeId.get(nodeId);
      }
      const skipDetail =
        await this.getNodeReadinessSkipReason(nodeId);
      readinessByNodeId.set(nodeId, skipDetail);
      return skipDetail;
    };

    const movesToExecute = [];
    const blockedAddNodeIds = new Set();
    for (const move of moves) {
      if (this.isShuttingDown) {
        return results;
      }
      if ((move?.type === MoveType.ADD || move?.type === MoveType.REPLACE) &&
          move?.nodeId) {
        const skipDetail =
          await getSkipReasonCached(move.nodeId);
        if (skipDetail !== null) {
          blockedAddNodeIds.add(move.nodeId);
        }
      }
    }

    for (const move of moves) {
      if (this.isShuttingDown) {
        return results;
      }
      const isDeferrableRemove = move?.type === MoveType.REMOVE &&
        move?.reason !== 'replica_failed';
      if (blockedAddNodeIds.size > 0 && isDeferrableRemove) {
        results.push({
          success: false,
          skipped: true,
          reason: REBALANCER_SKIP_REASON.AWAITING_READY_ADD_CAPACITY,
          operation: move.type,
          nodeId: move.nodeId,
          replicaId: move.replicaId,
        });
        continue;
      }
      movesToExecute.push(move);
    }

    const groupedMoves = this.groupMovesByTargetNode(movesToExecute);

    for (const [nodeId, nodeMoves] of groupedMoves.entries()) {
      if (this.isShuttingDown) {
        break;
      }
      if (nodeId) {
        const skipDetail = await getSkipReasonCached(nodeId);
        if (skipDetail !== null) {
          this.logger.debug(REBALANCER_LOG_MSG.SKIP_BATCH_UNREADY, {
            entityId: this.entityId,
            nodeId,
            moveCount: nodeMoves.length,
            skipDetail,
          });
          for (const move of nodeMoves) {
            results.push({
              success: false,
              skipped: true,
              reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
              skipDetail,
              operation: move.type,
              nodeId: move.nodeId,
              replicaId: move.replicaId,
            });
          }
          continue;
        }
      }

      for (let i = 0; i < nodeMoves.length; i += batchSize) {
        if (this.isShuttingDown) {
          break;
        }
        const batch = nodeMoves.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((move) => {
          return this.executeMove(move);
        }));

        results.push(...batchResults);

        if (nodeId) {
          const midBatchSkip =
            await this.getNodeReadinessSkipReason(nodeId);
          if (midBatchSkip !== null) {
            this.logger.debug(
              REBALANCER_LOG_MSG.NODE_DISCONNECTED_BATCH, {
                entityId: this.entityId,
                nodeId,
                remainingMoves:
                  nodeMoves.length - (i + batch.length),
                skipDetail: midBatchSkip,
              });
            const remainingMoves = nodeMoves.slice(i + batch.length);
            for (const move of remainingMoves) {
              results.push({
                success: false,
                skipped: true,
                reason: REBALANCER_SKIP_REASON.NODE_NOT_READY,
                skipDetail: midBatchSkip,
                operation: move.type,
                nodeId: move.nodeId,
                replicaId: move.replicaId,
              });
            }
            break;
          }
        }

        if (interBatchDelayMs > 0 && i + batchSize < nodeMoves.length) {
          await new Promise((resolve) => setTimeout(resolve, interBatchDelayMs));
        }
      }
    }

    return results;
  }

  /**
   * Main rebalancing entry point.
   * @param {string} trigger - What triggered the rebalance.
   * @param {Object} policy - Optional policy override.
   * @return {Promise<Object>} Rebalancing result.
   */
  async rebalance(trigger = TriggerType.PERIODIC, policy = null) {
    if (this.isShuttingDown) {
      return {success: false, skipped: true, reason: 'shutdown_in_progress'};
    }

    if (!this.isLeader) {
      this.logger.debug(REBALANCER_LOG_MSG.NOT_LEADER_SKIP, {
        entityId: this.entityId,
      });
      return {success: false, reason: 'not_leader'};
    }

    const effectivePolicy = policy || await this.getPolicy();
    const currentReplicas = this.getCurrentReplicas();
    const availableNodes = this.getAvailableNodes();
    if (availableNodes.length === 0) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      return {success: false, reason: 'no_available_nodes'};
    }

    const targetState = await this.movePlanner.calculateTargetState(
      currentReplicas,
      effectivePolicy,
    );
    const planningMembershipPublicationEpoch =
      this.resolvePublishedMembershipPlanningEpoch();
    const moves = await this.movePlanner.applyPressureGating(
      this.movePlanner.calculateMoves(currentReplicas, targetState),
    );

    if (moves.length === 0) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_REBALANCE_NEEDED, {
        entityId: this.entityId,
        currentCount: currentReplicas.length,
        targetCount: targetState.targetReplicaCount,
      });
      return {success: true, moves: [], reason: 'no_changes_needed'};
    }

    let availableBudget = this.maxConcurrentMoves;
    try {
      const configuredBudget = await this.getConfiguredRebalanceBudget();
      const inFlightCount = await this.getGlobalInFlightOperationCount();
      const isCritical = this.movePlanner.isCriticalState(
        currentReplicas,
        effectivePolicy,
        availableNodes,
      );
      const effectiveBudget = isCritical ?
        configuredBudget * this.criticalBudgetMultiplier :
        configuredBudget;

      availableBudget = Math.max(NUM.ZERO, effectiveBudget - inFlightCount);
      if (availableBudget <= 0) {
        const priorityBudgetBypass =
          await this.canBypassGlobalBudgetForPriorityRecovery(moves);
        if (priorityBudgetBypass === true) {
          availableBudget = NUM.ONE;
        } else {
          return {
            success: true,
            skipped: true,
            reason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
            moves: [],
          };
        }
      }
    } catch (error) {
      this.logger.warn(REBALANCER_LOG_MSG.REBALANCE_ERROR, {
        entityId: this.entityId,
        error: error.message,
      });
      return {
        success: false,
        skipped: true,
        reason: REBALANCER_SKIP_REASON.BUDGET_QUERY_FAILED,
        moves: [],
      };
    }

    this.logger.info(REBALANCER_LOG_MSG.START_REBALANCE, {
      entityId: this.entityId,
      entityType: this.entityType,
      trigger,
      moveCount: moves.length,
      currentCount: currentReplicas.length,
      targetCount: targetState.targetReplicaCount,
    });

    const moveLimit = Math.max(0, Math.min(this.maxConcurrentMoves, availableBudget));
    const limitedMoves = moves.slice(0, moveLimit).map((move) => {
      if (!Number.isInteger(planningMembershipPublicationEpoch) ||
          planningMembershipPublicationEpoch < 0) {
        return move;
      }
      return {
        ...move,
        membershipPublicationEpoch: planningMembershipPublicationEpoch,
      };
    });
    const results = await this.executeRebalancingMoves(limitedMoves);

    this.lastRebalanceTime = Date.now();
    this.rebalanceCount++;

    this.emit(REBALANCER_EVENT.REBALANCE_COMPLETE, {
      entityId: this.entityId,
      entityType: this.entityType,
      trigger,
      results,
    });

    return {
      success: true,
      moves: results,
      trigger,
      timestamp: this.lastRebalanceTime,
    };
  }

  /**
   * Resolve the published membership epoch used to bind a planning pass.
   * @return {number|null}
   * @private
   */
  resolvePublishedMembershipPlanningEpoch() {
    const readinessService = this.controlPlaneReadinessService;
    const diagnostics = readinessService &&
      typeof readinessService.getMembershipPublicationDiagnosticsSync ===
        TYPEOF.FUNCTION ?
      readinessService.getMembershipPublicationDiagnosticsSync(
        this.nodeId,
        Date.now(),
      ) :
      null;
    const publicationEpoch = Number(diagnostics?.publicationEpoch);
    const publicationStatus = String(
      diagnostics?.status ?? diagnostics?.publicationStatus ?? '',
    ).toUpperCase();
    if (publicationStatus === 'PUBLISHED' && Number.isInteger(publicationEpoch)) {
      return publicationEpoch;
    }

    const publicationService = readinessService?.membershipPublicationService;
    let publicationRow = null;
    if (publicationService &&
        typeof publicationService.getLatestClusterPublicationSync ===
          TYPEOF.FUNCTION) {
      publicationRow = publicationService.getLatestClusterPublicationSync();
    } else if (publicationService &&
        typeof publicationService.getLatestPublicationRowSync ===
          TYPEOF.FUNCTION) {
      publicationRow = publicationService.getLatestPublicationRowSync();
    }

    const fallbackEpoch = Number(
      publicationRow?.publicationEpoch ?? publicationRow?.publication_epoch,
    );
    const fallbackStatus = String(publicationRow?.status || '').toUpperCase();
    return fallbackStatus === 'PUBLISHED' && Number.isInteger(fallbackEpoch) ?
      fallbackEpoch :
      null;
  }


  /**
   * Schedule the next periodic check.
   */
  scheduleNextCheck(overrideDelayMs = null) {
    if (!this.isLeader || this.isShuttingDown) {
      return;
    }

    let delay = null;
    if (typeof overrideDelayMs === 'number' &&
        Number.isFinite(overrideDelayMs) &&
        overrideDelayMs > 0) {
      delay = Math.max(1000, Math.floor(overrideDelayMs));
    } else {
      // Add jitter: ±25% of interval to spread load
      const jitter = this.periodicCheckJitterMs * (Math.random() - 0.5) * 2;
      delay = Math.max(1000, this.currentInterval + jitter);
    }

    this.scheduledCheck = setTimeout(() => {
      // Avoid unhandled rejections from timer-triggered checks during shutdown races.
      void this.checkRebalance().catch(() => {});
    }, delay);

    this.logger.debug(REBALANCER_LOG_MSG.SCHEDULE_NEXT, {
      entityId: this.entityId,
      delayMs: Math.round(delay),
    });
  }

  /**
   * Cancel any scheduled check.
   */
  cancelScheduledCheck() {
    if (this.scheduledCheck) {
      clearTimeout(this.scheduledCheck);
      this.scheduledCheck = null;
    }
  }

  /**
   * Perform a rebalance check.
   * Requirements: 2.2, 2.3, 2.4
   * @return {Promise<void>}
   */
  async checkRebalance() {
    if (!this.isLeader || this.isShuttingDown) {
      return;
    }

    let forcePriorityRetry = false;
    try {
      // Cluster readiness gate — defer first planning cycle until
      // the cluster reaches a stable state (Requirements 4.1, 4.3, 4.4, 4.5)
      if (!this.clusterReadinessConfirmed) {
        const now = Date.now();
        if (this.clusterReadinessStartMs === null) {
          this.clusterReadinessStartMs = now;
        }

        const result = this.clusterReadinessSignal.evaluate({
          partitionServices: new Map(),
          messageGroupServices: new Map(),
          cdcSubscriptionsActive: true,
        });

        if (result.ready) {
          this.clusterReadinessConfirmed = true;
          this.logger.info(REBALANCER_LOG_MSG.CLUSTER_READINESS_CONFIRMED, {
            entityId: this.entityId,
          });
        } else {
          const elapsed = now - this.clusterReadinessStartMs;
          if (elapsed >= this.clusterReadinessTimeoutMs) {
            this.clusterReadinessConfirmed = true;
            this.logger.warn(
              REBALANCER_LOG_MSG.CLUSTER_READINESS_TIMEOUT, {
                entityId: this.entityId,
                elapsedMs: elapsed,
                unmetConditions: result.unmetConditions,
              });
          } else {
            this.logger.info(REBALANCER_LOG_MSG.CLUSTER_NOT_READY, {
              entityId: this.entityId,
              unmetConditions: result.unmetConditions,
            });
            this.schedulePriorityAwareCheck();
            return;
          }
        }
      }

      const timeUntilRebalanceEligibleMs =
        this.getTimeUntilRebalanceStartEligible();
      if (timeUntilRebalanceEligibleMs > 0) {
        this.logger.debug(REBALANCER_LOG_MSG.WAIT_START_DELAY, {
          entityId: this.entityId,
          entityType: this.entityType,
          remainingMs: timeUntilRebalanceEligibleMs,
          isSystemPartition: this.isSystemPartitionEntity(),
        });
        this.scheduleNextCheck(timeUntilRebalanceEligibleMs);
        return;
      }

      // Check if we're still in stabilization period (Requirements 2.2, 2.3)
      if (!this.isStabilized()) {
        this.logger.debug(REBALANCER_LOG_MSG.WAIT_STABILIZATION, {
          entityId: this.entityId,
          timeUntilStabilized: this.getTimeUntilStabilized(),
        });
        // Schedule next check after stabilization completes
        this.schedulePriorityAwareCheck();
        return;
      }

      const topologySettlingBlocker =
        await this.revalidateCriticalSystemTopologySettlingBlocker(
          this.getCriticalSystemTopologySettlingBlocker(),
        );
      if (topologySettlingBlocker) {
        this.currentInterval = Math.min(
          this.currentInterval * 1.25,
          this.maxInterval,
        );
        this.logger.info(REBALANCER_LOG_MSG.WAIT_TOPOLOGY_SETTLING, {
          entityId: this.entityId,
          entityType: this.entityType,
          delayMs: this.isControlPlanePriorityPartition() ?
            this.getPriorityRetryDelayMs() :
            this.currentInterval,
          blockerReason: topologySettlingBlocker.reason || null,
          unreadyNodeIds:
            Array.isArray(topologySettlingBlocker.unreadyNodeIds) ?
              [...topologySettlingBlocker.unreadyNodeIds] :
              [],
          missingNodeEndpointNodeIds:
            Array.isArray(topologySettlingBlocker.missingNodeEndpointNodeIds) ?
              [...topologySettlingBlocker.missingNodeEndpointNodeIds] :
              [],
          missingPostgresWireNodeIds:
            Array.isArray(topologySettlingBlocker.missingPostgresWireNodeIds) ?
              [...topologySettlingBlocker.missingPostgresWireNodeIds] :
              [],
          inFlightReplicaOperations: Number.isFinite(
            topologySettlingBlocker.inFlightReplicaOperations,
          ) ?
            topologySettlingBlocker.inFlightReplicaOperations :
            null,
          inFlightReplicaOperationsSource:
            topologySettlingBlocker.inFlightReplicaOperationsSource || null,
        });
        this.schedulePriorityAwareCheck(this.currentInterval);
        return;
      }

      const trafficReadinessBlocker =
        this.getCriticalSystemTrafficReadinessBlocker();
      if (trafficReadinessBlocker) {
        this.currentInterval = Math.min(
          this.currentInterval * 1.25,
          this.maxInterval,
        );
        this.logger.info(REBALANCER_LOG_MSG.WAIT_TRAFFIC_READY, {
          entityId: this.entityId,
          entityType: this.entityType,
          nodeId: this.nodeId,
          delayMs: this.isControlPlanePriorityPartition() ?
            this.getPriorityRetryDelayMs() :
            this.currentInterval,
          readinessPhase: trafficReadinessBlocker.phase || null,
          readinessReady: trafficReadinessBlocker.ready === true,
          reasonCodes: Array.isArray(trafficReadinessBlocker.reasons) ?
            [...trafficReadinessBlocker.reasons] :
            [],
          stableElapsedMs: Number.isFinite(
            trafficReadinessBlocker.stableElapsedMs,
          ) ?
            trafficReadinessBlocker.stableElapsedMs :
            null,
          stableWindowMs: Number.isFinite(
            trafficReadinessBlocker.stableWindowMs,
          ) ?
            trafficReadinessBlocker.stableWindowMs :
            null,
        });
        this.schedulePriorityAwareCheck(this.currentInterval);
        return;
      }

      const localServeReadinessBlocker =
        this.getCriticalSystemLocalServeReadinessBlocker();
      if (localServeReadinessBlocker) {
        this.currentInterval = Math.min(
          this.currentInterval * 1.25,
          this.maxInterval,
        );
        this.logger.info(REBALANCER_LOG_MSG.WAIT_LOCAL_SERVE_READINESS, {
          entityId: this.entityId,
          entityType: this.entityType,
          nodeId: this.nodeId,
          delayMs: this.isControlPlanePriorityPartition() ?
            this.getPriorityRetryDelayMs() :
            this.currentInterval,
          reasonCodes: Array.isArray(localServeReadinessBlocker.reasons) ?
            localServeReadinessBlocker.reasons
              .map((reason) => String(reason?.code || ''))
              .filter(Boolean) :
            [],
        });
        this.schedulePriorityAwareCheck(this.currentInterval);
        return;
      }

      const localMutationReadinessBlocker =
        this.getLocalControlPlaneMutationReadinessBlocker();
      if (localMutationReadinessBlocker) {
        this.currentInterval = Math.min(
          this.currentInterval * 1.25,
          this.maxInterval,
        );
        this.logger.info(REBALANCER_LOG_MSG.WAIT_LOCAL_MUTATION_READINESS, {
          entityId: this.entityId,
          entityType: this.entityType,
          nodeId: this.nodeId,
          delayMs: this.isControlPlanePriorityPartition() ?
            this.getPriorityRetryDelayMs() :
            this.currentInterval,
          failedDimensions:
            Array.isArray(localMutationReadinessBlocker.failedDimensions) ?
              [...localMutationReadinessBlocker.failedDimensions] :
              [],
          reasonCodes:
            Array.isArray(localMutationReadinessBlocker.reasonCodes) ?
              [...localMutationReadinessBlocker.reasonCodes] :
              [],
        });
        this.schedulePriorityAwareCheck(this.currentInterval);
        return;
      }

      const controlPlanePriorityBlocker =
        this.getControlPlanePrioritySpreadBlocker();
      if (controlPlanePriorityBlocker) {
        const blockedPartitions =
          controlPlanePriorityBlocker.blockedPartitions || [];
        const largestSpreadGap = blockedPartitions.reduce(
          (largestGap, partition) => Math.max(
            largestGap,
            Number(partition?.spreadGap) || NUM.ZERO,
          ),
          NUM.ZERO,
        );
        this.logger.info(REBALANCER_LOG_MSG.WAIT_CONTROL_PLANE_PRIORITY, {
          entityId: this.entityId,
          entityType: this.entityType,
          delayMs: this.getPriorityRetryDelayMs(),
          requiredDistinctNodeCount:
            controlPlanePriorityBlocker.requiredDistinctNodeCount,
          blockedPartitionCount: blockedPartitions.length,
          largestSpreadGap,
          blockedPartitions: blockedPartitions.map((partition) => ({
            partitionId: partition.partitionId,
            readyReplicaCount: partition.readyReplicaCount,
            readyDistinctNodeCount: partition.readyDistinctNodeCount,
            spreadGap: partition.spreadGap,
          })),
        });
        this.scheduleNextCheck(this.getPriorityRetryDelayMs());
        return;
      }

      const transportPressure = this.getTransportPressureSummary();
      if (transportPressure?.backpressured === true) {
        const isPriorityPartition = this.isControlPlanePriorityPartition();
        if (!isPriorityPartition) {
          this.currentInterval = Math.min(
            this.currentInterval * 1.5,
            this.maxInterval,
          );
        }
        this.logger.info(REBALANCER_LOG_MSG.WAIT_TRANSPORT_BACKPRESSURE, {
          entityId: this.entityId,
          entityType: this.entityType,
          saturatedNodeCount: transportPressure.saturatedNodeCount,
          totalPending: transportPressure.totalPending,
          maxPendingUtilization: transportPressure.maxPendingUtilization,
          delayMs: isPriorityPartition ?
            this.getPriorityRetryDelayMs() :
            this.currentInterval,
        });
        this.schedulePriorityAwareCheck(this.currentInterval);
        return;
      }

      // Re-evaluate state after stabilization (Requirement 2.4)
      const needsRebalance = await this.evaluateState();

      if (needsRebalance) {
        const rebalanceResult = await this.rebalance(TriggerType.PERIODIC);
        const executedMoveCount = this.countExecutedMoves(rebalanceResult);

        if (executedMoveCount > 0) {
          // Reset interval only when work was actually scheduled/executed.
          this.currentInterval = this.isControlPlanePriorityPartition() ?
            this.getPriorityRetryDelayMs() :
            this.periodicCheckIntervalMs;
        } else {
          if (this.isControlPlanePriorityPartition()) {
            // Priority control-plane spread must retry quickly even when one
            // execution pass only observed skipped moves.
            this.currentInterval = this.getPriorityRetryDelayMs();
            forcePriorityRetry = true;
          } else {
            // No actionable work (all skipped/blocked); back off to reduce CPU/log churn.
            this.currentInterval = Math.min(
              this.currentInterval * 1.5,
              this.maxInterval,
            );
          }
        }
      } else {
        if (this.isControlPlanePriorityPartition()) {
          // Priority control-plane spread must keep a short cadence even
          // when one evaluation pass is currently balanced, because published
          // membership epochs can change while recovery is still active.
          this.currentInterval = this.getPriorityRetryDelayMs();
        } else {
          // Exponential backoff if stable - check less frequently
          this.currentInterval = Math.min(
            this.currentInterval * 1.5,
            this.maxInterval,
          );
        }
      }
    } catch (error) {
      this.logger.error(REBALANCER_LOG_MSG.REBALANCE_ERROR, {
        entityId: this.entityId,
        error: error.message,
      });
      throw error;
    }

    // Schedule next check
    if (!this.isShuttingDown) {
      if (forcePriorityRetry) {
        this.scheduleNextCheck(this.getPriorityRetryDelayMs());
      } else {
        this.scheduleNextCheck();
      }
    }
  }

  /**
   * Return the local router's outbound pressure summary when available.
   * @return {Object|null}
   * @private
   */
  getTransportPressureSummary() {
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).getPressureSummary(['rebalancer:schedule']);
  }

  /**
   * Count moves that actually scheduled work (not skipped/deferred).
   * @param {Object} rebalanceResult - Result from rebalance().
   * @return {number} Number of actionable moves.
   * @private
   */
  countExecutedMoves(rebalanceResult) {
    if (!rebalanceResult || !Array.isArray(rebalanceResult.moves)) {
      return 0;
    }

    return rebalanceResult.moves.filter((move) => {
      if (!move || move.skipped) {
        return false;
      }
      return move.success !== false;
    }).length;
  }

  /**
   * Evaluate if rebalancing is needed.
   * @return {Promise<boolean>} True if rebalancing is needed.
   */
  async evaluateState() {
    const currentReplicas = this.getCurrentReplicas();
    const policy = await this.getPolicy();
    const availableNodes = this.getAvailableNodes();
    const assessment = this.movePlanner.assessState(
      currentReplicas,
      policy,
      availableNodes,
    );
    const {
      actionableTarget,
      critical,
      criticalReason,
      desiredTarget,
      healthyReplicas,
      suboptimal,
    } = assessment;

    this.logger.debug(REBALANCER_LOG_MSG.EVALUATING_STATE, {
      entityId: this.entityId,
      entityType: this.entityType,
      currentReplicaCount: currentReplicas.length,
      availableNodeCount: availableNodes.length,
      hasCache: !!this.systemTableCache,
      targetReplicaCount: desiredTarget,
      actionableTargetReplicaCount: actionableTarget,
    });

    // Skip rebalancing if cache appears unpopulated (no nodes known)
    // This prevents newly joined nodes from making incorrect decisions
    // before their cache is synchronized with the cluster state
    if (availableNodes.length === 0) {
      this.logger.debug(REBALANCER_LOG_MSG.NO_AVAILABLE_NODES, {
        entityId: this.entityId,
        entityType: this.entityType,
      });
      this.lastSuboptimalSignal = null;
      return false;
    }

    if (availableNodes.length < desiredTarget &&
        healthyReplicas.length >= actionableTarget) {
      const degradedSignal = this.buildDegradedTargetSignal(
        availableNodes,
        desiredTarget,
        actionableTarget,
        healthyReplicas.length,
      );
      if (this.lastDegradedTargetSignal !== degradedSignal) {
        this.lastDegradedTargetSignal = degradedSignal;
        this.logger.info(REBALANCER_LOG_MSG.DEGRADED_TARGET, {
          entityId: this.entityId,
          entityType: this.entityType,
          availableNodeCount: availableNodes.length,
          desiredTargetReplicaCount: desiredTarget,
          actionableTargetReplicaCount: actionableTarget,
          healthyReplicaCount: healthyReplicas.length,
        });
      }
    } else {
      this.lastDegradedTargetSignal = null;
    }

    // Critical checks - trigger immediate rebalancing
    if (critical) {
      this.lastSuboptimalSignal = null;
      this.logger.warn(REBALANCER_LOG_MSG.CRITICAL_STATE, {
        entityId: this.entityId,
        entityType: this.entityType,
        reason: criticalReason,
      });
      return true;
    }

    // Opportunistic checks - can wait for periodic schedule
    if (suboptimal) {
      const suboptimalSignal = this.buildSuboptimalSignal(
        availableNodes,
        desiredTarget,
        actionableTarget,
        healthyReplicas.length,
      );
      if (this.lastSuboptimalSignal !== suboptimalSignal) {
        this.lastSuboptimalSignal = suboptimalSignal;
        this.logger.info(REBALANCER_LOG_MSG.SUBOPTIMAL_STATE, {
          entityId: this.entityId,
          entityType: this.entityType,
          availableNodeCount: availableNodes.length,
          desiredTargetReplicaCount: desiredTarget,
          actionableTargetReplicaCount: actionableTarget,
          healthyReplicaCount: healthyReplicas.length,
        });
      }
      return true;
    }

    this.lastSuboptimalSignal = null;
    return false;
  }

  /**
   * Build a stable signal for degraded-target logging dedupe.
   * @param {Array<Object>} availableNodes - Ready nodes currently visible.
   * @param {number} desiredTarget - Policy target replica count.
   * @param {number} actionableTarget - Target constrained by ready topology.
   * @param {number} healthyReplicaCount - Current healthy replica count.
   * @return {string} Stable topology signal.
   * @private
   */
  buildDegradedTargetSignal(
    availableNodes,
    desiredTarget,
    actionableTarget,
    healthyReplicaCount,
  ) {
    const nodeSignature = availableNodes
      .map((node) => node?.node_id || node?.id || '')
      .filter(Boolean)
      .sort()
      .join(',');
    return `${nodeSignature}|${desiredTarget}|${actionableTarget}|` +
      `${healthyReplicaCount}`;
  }

  /**
   * Build a stable signal for suboptimal-state logging dedupe.
   * @param {Array<Object>} availableNodes - Ready nodes currently visible.
   * @param {number} desiredTarget - Policy target replica count.
   * @param {number} actionableTarget - Target constrained by ready topology.
   * @param {number} healthyReplicaCount - Current healthy replica count.
   * @return {string} Stable suboptimal-state signal.
   * @private
   */
  buildSuboptimalSignal(
    availableNodes,
    desiredTarget,
    actionableTarget,
    healthyReplicaCount,
  ) {
    const nodeSignature = availableNodes
      .map((node) => node?.node_id || node?.id || '')
      .filter(Boolean)
      .sort()
      .join(',');
    return `${nodeSignature}|${desiredTarget}|${actionableTarget}|` +
      `${healthyReplicaCount}`;
  }

  /**
   * Check if current state is critical (requires immediate action).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is critical.
   */
  isCriticalState(replicas, policy, availableNodes = null) {
    return this.movePlanner.isCriticalState(
      replicas,
      policy,
      availableNodes,
    );
  }

  /**
   * Get the reason for critical state.
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {string} Reason description.
   */
  getCriticalReason(replicas, policy, availableNodes = null) {
    return this.movePlanner.getCriticalReason(
      replicas,
      policy,
      availableNodes,
    );
  }

  /**
   * Check if current state is suboptimal (can be improved).
   * @param {Array<Object>} replicas - Current replicas.
   * @param {Object} policy - Applicable policy.
   * @return {boolean} True if state is suboptimal.
   */
  isSuboptimalState(replicas, policy, availableNodes = null) {
    return this.movePlanner.isSuboptimalState(
      replicas,
      policy,
      availableNodes,
    );
  }

  /**
   * Check if multiple replicas are on the same node.
   * @param {Array<Object>} replicas - Replicas to check.
   * @return {boolean} True if duplicates exist.
   */
  hasMultipleReplicasOnSameNode(replicas) {
    return this.movePlanner.hasMultipleReplicasOnSameNode(replicas);
  }

  /**
   * Get nodes that don't have a local replica.
   * @param {Array<Object>} replicas - Current replicas.
   * @return {Array<string>} Node IDs without local replicas.
   */
  getNodesWithoutLocalReplica(replicas) {
    return this.movePlanner.getNodesWithoutLocalReplica(replicas);
  }

  /**
   * Trigger immediate check (called by CDC event handlers).
   * @param {string} reason - Reason for immediate check.
   */
  triggerImmediateCheck(reason) {
      if (!this.isLeader || this.isShuttingDown) {
        return;
      }

      this.logger.info(REBALANCER_LOG_MSG.IMMEDIATE_TRIGGER, {
        entityId: this.entityId,
        entityType: this.entityType,
        reason,
      });

      const reconcileReason = this.mapTriggerReason(reason);
      this.rebalanceCheckQueue.enqueue(
        this.entityId,
        reconcileReason,
      );
    }

  /**
   * Map a trigger reason string to a typed RECONCILE_REASON constant.
   * @param {string} reason - The trigger reason.
   * @return {string} A RECONCILE_REASON constant.
   * @private
   */
  mapTriggerReason(reason) {
    switch (reason) {
      case 'node_became_ready':
        return RECONCILE_REASON.NODE_BECAME_READY;
      case 'node_left_ready':
        return RECONCILE_REASON.NODE_LEFT_READY;
      case 'node_failed':
        return RECONCILE_REASON.NODE_FAILED;
      default:
        return RECONCILE_REASON.PERIODIC_CHECK;
    }
  }

  /**
   * Reconcile callback for the rebalance check queue.
   * Cancels any pending scheduled check and runs checkRebalance.
   * @param {Array<string>} _reasons - Accumulated reason codes.
   * @private
   */
  async reconcileRebalanceCheck(_reasons) {
    this.cancelScheduledCheck();
    await this.checkRebalance();
  }

  /**
   * Handle node state change notification from CDC.
   * Called by CDCIntegrationService when a node's state changes.
   * Emits 'nodeStateChange' event and optionally 'rebalanceNeeded' event.
   * @param {string} nodeId - The node ID.
   * @param {string} oldState - The previous state.
   * @param {string} newState - The new state.
   */
  onNodeStateChange(nodeId, oldState, newState) {
    // Always emit nodeStateChange event for observability
    this.emit(REBALANCER_EVENT.NODE_STATE_CHANGE, {
      nodeId,
      oldState,
      newState,
      timestamp: Date.now(),
    });

    // Non-leaders still emit events but don't trigger rebalancing
    if (!this.isLeader) {
      return;
    }

    this.logger.debug(REBALANCER_LOG_MSG.NODE_STATE_CHANGE, {
      entityId: this.entityId,
      nodeId,
      oldState,
      newState,
    });

    // Determine if rebalancing is needed based on state transition
    let rebalanceNeeded = false;
    let reason = null;

    // Node became ready - may need to rebalance to use this node
    if (newState === NodeStatus.ACTIVE && oldState !== NodeStatus.ACTIVE) {
      rebalanceNeeded = true;
      reason = 'node_became_ready';
    }

    // Node left active state - may need to relocate replicas
    if (oldState === NodeStatus.ACTIVE && newState !== NodeStatus.ACTIVE) {
      rebalanceNeeded = true;
      reason = 'node_left_ready';
    }

    // Node failed - critical, need immediate action
    if (newState === NodeStatus.FAILED) {
      rebalanceNeeded = true;
      reason = 'node_failed';
    }

    if (rebalanceNeeded) {
      // Record state change to reset stabilization timer
      if (newState === NodeStatus.FAILED) {
        this.recordStateChange(
          STABILIZATION_RESET_TRIGGER.NODE_FAILED,
        );
      } else if (
        newState === NodeStatus.ACTIVE &&
        oldState !== NodeStatus.ACTIVE
      ) {
        this.recordStateChange(
          STABILIZATION_RESET_TRIGGER.NODE_JOINED,
        );
      } else if (
        oldState === NodeStatus.ACTIVE &&
        newState !== NodeStatus.ACTIVE
      ) {
        this.recordStateChange(
          STABILIZATION_RESET_TRIGGER.NODE_LEFT,
        );
      }

      // Emit rebalanceNeeded event for observability
      this.emit(REBALANCER_EVENT.REBALANCE_NEEDED, {
        nodeId,
        oldState,
        newState,
        reason,
        timestamp: Date.now(),
      });

      this.triggerImmediateCheck(reason);
    }
  }

  /**
   * Check if a CDC event is critical.
   * @param {Object} event - CDC event.
   * @return {boolean} True if event is critical.
   */
  isCriticalCDCEvent(event) {
    // Node failure is critical
    if (event.tableName === 'nodes' &&
        event.operation === 'UPDATE' &&
        event.data?.status === NodeStatus.FAILED) {
      return this.affectsMyReplicas(event);
    }

    // Service failure is critical
    if (event.tableName === 'services' &&
        event.operation === 'UPDATE' &&
        event.data?.status === ReplicaStatus.FAILED) {
      return event.data?.partition_id === this.entityId ||
        event.data?.group_id === this.entityId ||
        (this.entityType === EntityType.RUNTIME_SERVICE &&
          event.data?.service_id === this.entityId);
    }

    return false;
  }

  /**
   * Check if an event affects this entity's replicas.
   * @param {Object} event - CDC event.
   * @return {boolean} True if event affects our replicas.
   */
  affectsMyReplicas(event) {
    const replicas = this.getCurrentReplicas();
    const nodeId = event.data?.node_id;

    if (!nodeId) {
      return false;
    }

    // Filter out replicas without node_id (defensive check)
    return replicas.some((r) => r && r.node_id === nodeId);
  }

  /**
   * Get rebalancer statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    const stats = {
      entityId: this.entityId,
      entityType: this.entityType,
      isLeader: this.isLeader,
      lastRebalanceTime: this.lastRebalanceTime,
      rebalanceCount: this.rebalanceCount,
      currentInterval: this.currentInterval,
      initialized: this.initialized,
      usingCoordinator: !!this.rebalanceCoordinator,
    };

    // Coordinator stats are fetched asynchronously via getStatsAsync()
    // This method returns basic stats synchronously for backward compatibility

    return stats;
  }

  /**
   * Get rebalancer statistics including coordinator stats (async).
   * @return {Promise<Object>} Statistics object with coordinator stats.
   */
  async getStatsAsync() {
    const stats = this.getStats();

    // Include coordinator stats if available
    if (this.rebalanceCoordinator && this.rebalanceCoordinator.getStats) {
      const coordStats = await this.rebalanceCoordinator.getStats();
      stats.coordinatorStats = {
        inFlightOperations: coordStats.inFlightOperations,
        operationsCreated: coordStats.operationsCreated,
        operationsCompleted: coordStats.operationsCompleted,
        operationsFailed: coordStats.operationsFailed,
      };
    }

    return stats;
  }

  /**
   * Shutdown the rebalancer.
   */
  shutdown() {
    this.isShuttingDown = true;
    this.isLeader = false;
    this.cancelScheduledCheck();
    this.rebalanceCheckQueue.shutdown();
    // Clear stabilization timer
    if (this.stabilizationTimer) {
      clearTimeout(this.stabilizationTimer);
      this.stabilizationTimer = null;
    }
    this.lastStateChangeTime = null;
    this.initialized = false;

    this.logger.info(REBALANCER_LOG_MSG.SHUTDOWN, {
      entityId: this.entityId,
      entityType: this.entityType,
    });
  }
}

export {
  UnifiedRebalancer,
  EntityType,
  TriggerType,
  MoveType,
  ReplicaStatus,
  NodeStatus,
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
  isOddReplicaCount,
  adjustToOddCount,
  getNextOddCount,
  getPreviousOddCount,
};
