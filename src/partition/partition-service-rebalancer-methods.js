import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  EntityType,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  UnifiedRebalancer,
  assertCritical,
} = PARTITION_SERVICE_SHARED;

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
function buildRebalancerDependencyBundle(service) {
  const systemTableCache = service.systemTableCache;
  const cdcIntegrationService = service.cdcIntegrationService;
  const tablePolicyService = service.tablePolicyService;
  const messageRouter = service.messageRouter;
  const sqlQueryEngine = service.sqlQueryEngine;
  const rebalanceCoordinator = service.rebalanceCoordinator;
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
function applyRebalancerDependencies(service, bundle) {
  if (!bundle || !service.rebalancer) {
    return;
  }
  if (bundle.rebalanceCoordinator) {
    bundle.rebalanceCoordinator.systemTableCache = bundle.systemTableCache;
    bundle.rebalanceCoordinator.cdcIntegrationService =
      bundle.cdcIntegrationService;
    bundle.rebalanceCoordinator.tablePolicyService =
      bundle.tablePolicyService;
    bundle.rebalanceCoordinator.sqlQueryEngine = bundle.sqlQueryEngine;
    bundle.rebalanceCoordinator.syncOwnerDependencies(bundle);
  }
  // The partition's own UnifiedRebalancer (initializeRebalancer) takes the
  // whole bundle, the coordinator included, through its one setter.
  service.rebalancer.syncOwnerDependencies(bundle);
  service.logger.debug(
    PARTITION_SERVICE_LOG_MSG.REBALANCER_DEPENDENCIES_APPLIED,
    {partitionId: service.partitionId},
  );
}

/**
 * Initialize rebalancer only when required dependencies are ready.
 *
 * @param {Object} [options]
 * @param {boolean} [options.readinessTransitionOnly=false] - When true the
 *   caller is the shared metadata-publication readiness-transition fan-out
 *   (handleMetadataPublicationReadinessTransition), which never changes the
 *   rebalancer's dependencies — only the node-wide readiness phase toggled.
 *   In that case the unconditional dependency re-wiring is provably redundant
 *   unless it crosses an actual rebalancer-leadership EDGE, so it is skipped
 *   on a no-edge transition (the freeze fix). Every other caller (dependency
 *   setters, leadership updates) keeps the unconditional re-apply.
 * @private
 */
function maybeInitializeRebalancer(service, options = {}) {
  const readinessTransitionOnly = options.readinessTransitionOnly === true;
  const backgroundReady = service.isBackgroundWorkReady();
  if (service.rebalancer) {
    // Edge-gate (readiness-transition path only): the shared metadata-
    // publication readiness state is a single node-wide object that ~every
    // partition's rebalancer listens to. During control-plane recovery it
    // oscillates (PRIORITY_CONTROL_PLANE_RECOVERY_PENDING toggles), and one
    // transition synchronously fans this call out across every partition in a
    // single tick. The dependency re-wiring below only re-binds STABLE deps
    // (systemTableCache, cdcIntegrationService, tablePolicyService,
    // messageRouter, sqlQueryEngine, rebalanceCoordinator) that are fixed at
    // init and unchanged by a readiness blip; on this path it is required only
    // on an actual rebalancer-leadership EDGE (or first init). When the
    // resolved leadership is UNCHANGED, the re-apply is provably redundant —
    // skipping it makes a no-edge oscillation do ZERO fan-out work and avoids
    // the multi-second event-loop freeze that starves the readiness probes and
    // sustains the limit cycle. setLeader is already edge-aware, so calling it
    // on an unchanged outcome is a no-op. Dependency-setter callers do NOT pass
    // readinessTransitionOnly, so their re-apply is unchanged.
    const desiredLeadership = service.resolveRebalancerLeadership();
    const hasLeadershipEdge = service.rebalancer.isLeader !== desiredLeadership;
    const skipReapply = readinessTransitionOnly && !hasLeadershipEdge;
    if (!skipReapply) {
      const bundle2 = service.buildRebalancerDependencyBundle();
      service.applyRebalancerDependencies(bundle2);
    }
    service.rebalancer.setLeader(desiredLeadership);
    service.driveRebalancerLeadershipSink();
    return;
  }
  if (!backgroundReady || !service.isLeader) {
    return;
  }
  const bundle = service.buildRebalancerDependencyBundle();
  if (!bundle) {
    return;
  }
  service.initializeRebalancer(bundle);
}

/**
 * Initialize rebalancer components with required dependencies.
 * @param {Object} [bundle] - Optional pre-built dependency bundle.
 *   When omitted, dependencies are read from PartitionService state
 *   and individually validated.
 * @private
 */
function initializeRebalancer(service, bundle) {
  const src = bundle || service;
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
  rebalanceCoordinator.syncOwnerDependencies({
    systemTableCache,
    cdcIntegrationService,
    tablePolicyService,
    messageRouter,
    sqlQueryEngine,
  });
  rebalanceCoordinator.initialize();
  service.rebalancer = new UnifiedRebalancer({
    entityId: service.partitionId,
    entityType: EntityType.PARTITION,
    systemTableCache,
    cdcIntegrationService,
    tablePolicyService,
    sqlQueryEngine,
    nodeId: service.nodeId,
    replicaId: service.replicaId,
    replicaStateMachine: service.replicaStateMachine,
    messageRouter,
    rebalanceCoordinator,
    controlPlaneReadinessService:
      rebalanceCoordinator.controlPlaneReadinessService,
  });
  service.rebalancer.initialize();
  service.rebalancer.setLeader(service.resolveRebalancerLeadership());
  service.driveRebalancerLeadershipSink();
}

export {
  applyRebalancerDependencies,
  buildRebalancerDependencyBundle,
  initializeRebalancer,
  maybeInitializeRebalancer,
};
