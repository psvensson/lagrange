import {PARTITION_SERVICE_SHARED} from "./partition-service-shared.js";

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

class PartitionServiceRebalancerMethods {
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
        this.rebalancer.setLeader(this.resolveRebalancerLeadership());
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
    this.rebalancer.setLeader(this.resolveRebalancerLeadership());
  }
}

function createPartitionServiceRebalancerMethods() {
  const methods = {};
  for (const name of Object.getOwnPropertyNames(PartitionServiceRebalancerMethods.prototype)) {
    if (name !== "constructor") {
      methods[name] = PartitionServiceRebalancerMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceRebalancerMethods};
