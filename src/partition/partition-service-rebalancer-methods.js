import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {isTrafficReady} from '../bootstrap/traffic-readiness-utils.js';
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';
import {LEDGER_PARTITION_ID} from './partition-placement-admission-decision.js';

const {
  EntityType,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  UnifiedRebalancer,
  assertCritical,
} = PARTITION_SERVICE_SHARED;

const TRAFFIC_READY_STAGGER_BASE_MS = 12000;
const TRAFFIC_READY_STAGGER_SLOTS = 39;
const TRAFFIC_READY_STAGGER_STEP_MS = 250;
const ENTITY_STAGGER_HASH_MULTIPLIER = 31;

function computeEntityStaggerBucket(entityId, slotCount) {
  const key = entityId ? String(entityId) : '';
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * ENTITY_STAGGER_HASH_MULTIPLIER + key.charCodeAt(index)) >>> 0;
  }
  return hash % slotCount;
}

function isPartitionTrafficReady(service) {
  if (!service.metadataPublicationReadinessState) {
    return true;
  }
  return isTrafficReady(service.metadataPublicationReadinessState);
}

function isFormationDependencyTrafficReadyWake(rebalancer, options) {
  return (
    options.trafficReady === true &&
    !options.wasTrafficReady &&
    rebalancer.isFormationLivenessDependencyPartition?.() === true &&
    rebalancer.isPartitionBelowDeclaredDistinctHostSpread?.() === true
  );
}

function shouldStaggerTrafficReadyWake(rebalancer) {
  if (rebalancer.isFormationLivenessDependencyPartition?.() === true) {
    return false;
  }
  if (rebalancer.isControlPlanePriorityPartition?.() === true) {
    return false;
  }
  return (
    rebalancer.isPartitionBelowDeclaredDistinctHostSpread?.() === true &&
    Boolean(rebalancer.scheduleNextCheck)
  );
}

function maybeWakeRebalancerOnTrafficReady(rebalancer, options = {}) {
  const backgroundEdge =
    options.backgroundReady === true && !options.wasBackgroundReady;
  const formationEdge =
    isFormationDependencyTrafficReadyWake(rebalancer, options);
  if (
    !options.readinessTransitionOnly ||
    rebalancer.isLeader !== true ||
    (!backgroundEdge && !formationEdge)
  ) {
    return;
  }
  rebalancer.currentInterval = rebalancer.periodicCheckIntervalMs;
  rebalancer.lastCheckAtMs = 0;
  rebalancer.lastStateChangeTime = 0;
  if (shouldStaggerTrafficReadyWake(rebalancer)) {
    rebalancer.syncOperationContinuationWake?.(null, 0);
    const bucket = computeEntityStaggerBucket(
      rebalancer.entityId,
      TRAFFIC_READY_STAGGER_SLOTS,
    );
    const delayMs =
      TRAFFIC_READY_STAGGER_BASE_MS + bucket * TRAFFIC_READY_STAGGER_STEP_MS;
    rebalancer.scheduleNextCheck(delayMs);
    return;
  }
  rebalancer.enqueueRebalanceCheck(RECONCILE_REASON.PERIODIC_CHECK);
}

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
  ensureReplicaPlacementOwnerAttached() {
    if (
      this.partitionId !== LEDGER_PARTITION_ID ||
      this.isShutdown ||
      this.replicaPlacementOwnerAttachment ||
      this.rebalancerLeadershipSink ||
      !this.systemTableCache ||
      !this.rebalanceCoordinator
    ) {
      return;
    }
    if (!this.rebalanceCoordinator.attachLedgerReplicaPlacementOwner) {
      return;
    }
    this.replicaPlacementOwnerAttachment =
      this.rebalanceCoordinator.attachLedgerReplicaPlacementOwner(this);
  }

  maybeInitializeRebalancer(options = {}) {
    const readinessTransitionOnly = options.readinessTransitionOnly === true;
    const backgroundReady = this.isBackgroundWorkReady();
    const wasBackgroundReady = this._lastBackgroundWorkReady === true;
    this._lastBackgroundWorkReady = backgroundReady;
    const trafficReady = isPartitionTrafficReady(this);
    const wasTrafficReady = this._lastTrafficReady === true;
    this._lastTrafficReady = trafficReady;
    this.ensureReplicaPlacementOwnerAttached();
    this.driveRebalancerLeadershipSink();
    if (this.rebalancer) {
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
      const desiredLeadership = this.resolveRebalancerLeadership();
      const hasLeadershipEdge = this.rebalancer.isLeader !== desiredLeadership;
      const skipReapply = readinessTransitionOnly && !hasLeadershipEdge;
      if (!skipReapply) {
        const bundle2 = this.buildRebalancerDependencyBundle();
        this.applyRebalancerDependencies(bundle2);
      }
      if (
        typeof this.rebalancer.setLeader === PARTITION_SERVICE_TYPE.FUNCTION
      ) {
        this.rebalancer.setLeader(desiredLeadership);
      }
      this.driveRebalancerLeadershipSink();
      maybeWakeRebalancerOnTrafficReady(this.rebalancer, {
        readinessTransitionOnly,
        backgroundReady,
        wasBackgroundReady,
        trafficReady,
        wasTrafficReady,
      });
      return;
    }
    if (this.rebalanceCoordinator?.placementAdmissionEnabled === true) {
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
    maybeWakeRebalancerOnTrafficReady(this.rebalancer, {
      readinessTransitionOnly,
      backgroundReady,
      wasBackgroundReady,
      trafficReady,
      wasTrafficReady,
    });
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
      replicaId: this.replicaId,
      replicaStateMachine: this.replicaStateMachine,
      messageRouter,
      rebalanceCoordinator,
      controlPlaneReadinessService:
        rebalanceCoordinator.controlPlaneReadinessService,
    });
    this.rebalancer.initialize();
    this.rebalancer.setLeader(this.resolveRebalancerLeadership());
    this.driveRebalancerLeadershipSink();
    this._lastBackgroundWorkReady = this.isBackgroundWorkReady();
    this._lastTrafficReady = isPartitionTrafficReady(this);
  }
}

function createPartitionServiceRebalancerMethods() {
  const methods = {};
  for (const name of Object.getOwnPropertyNames(PartitionServiceRebalancerMethods.prototype)) {
    if (name !== 'constructor') {
      methods[name] = PartitionServiceRebalancerMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceRebalancerMethods};
