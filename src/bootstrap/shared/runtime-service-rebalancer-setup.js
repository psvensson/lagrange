/**
 * RuntimeServiceRebalancerOwner — the single planning leader that reconciles
 * RUNTIME_SERVICE desired state (`service_definitions.replica_count`, read via
 * `getRuntimeServicePolicy`) to placed replicas (the `services` table), running
 * one `UnifiedRebalancer` per active runtime service.
 *
 * This is the missing piece that makes runtime services (e.g. the built-in
 * `sys-postgres-wire` Postgres-wire endpoint) first-class replicated entities:
 * the planner/executor/dispatch machinery for RUNTIME_SERVICE already exists and
 * is exercised by the move-planner / runtime-service-handler / pgwire-rebalance
 * tests — only a planning owner was absent, so no replica was ever placed.
 *
 * Leadership is gated EXTERNALLY by the wiring (the node that leads the
 * `service_definitions-p1` partition, which holds the desired-state table and is
 * the proven cluster-singleton). The wiring drives {@link setLeader}. While
 * leader the owner maintains one rebalancer per active RUNTIME_SERVICE
 * definition; while not leader (or shutting down) it holds none — so exactly one
 * node plans cluster-wide and there is no duplicate-ADD storm.
 *
 * `service_definitions` is a system table but NOT a priority control-plane table,
 * so these rebalancers run on the normal (non-priority) lane and do not compete
 * with the rolling-restart priority cadence.
 */

import {UnifiedRebalancer} from '../../rebalancer/unified-rebalancer.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../system-table-schemas-constants.js';
import {UNIFIED_SERVICE_TYPE} from '../../constants/unified-service-lifecycle.js';
import {
  WASM_SERVICE_DEFINITION_STATUS,
} from '../../wasm-service/wasm-service-constants.js';
import {LoggingService} from '../../logging/logging-service.js';
import {DependencyError} from '../bootstrap-errors.js';
import {
  getBindingServiceDefinitionSourceKind,
  hasRequestBindingServiceDefinitionLineage,
  requestBindingServiceDefinitionRowsMatch,
  supportsBindingServiceDefinitionSourceKind,
} from '../../control-plane/owners/request-binding-service-definition-contract.js';
import {
  DEPLOYMENT_BINDING_SOURCE_KIND,
} from '../../control-plane/owners/deployment-binding-contract.js';

const SUBSYSTEM_NAME = 'runtime-service-rebalancer-owner';
const RUNTIME_SERVICE_REBALANCER_OWNER_NAME = 'RuntimeServiceRebalancerOwner';
const TYPEOF_STRING = 'string';
const SINK_WIRING_RETRY_INTERVAL_MS = 5000;
const BINDING_RECONCILE_INTERVAL_MS = 5000;

// `service_definitions` is the desired-state table for runtime services ONLY
// (partitions/message-groups live in their own tables), so every row is a
// RUNTIME_SERVICE entity — there is NO `service_type` column on it (it is dropped
// by serializeServiceDefinition). The owner therefore selects active definitions
// by `status`. Active request-Binding lineage is admitted to the same owner;
// other Binding sources and malformed lineage fail closed. Whether an admitted
// service should actually run is governed by `replica_count`, which the policy
// reads.
const SERVICE_DEFINITION_COLUMN = Object.freeze({
  SERVICE_ID: 'service_id',
  STATUS: 'status',
});

const REQUIRED_DEPENDENCIES = Object.freeze([
  'nodeId',
  'systemTableCache',
  'cdcIntegrationService',
  'tablePolicyService',
  'messageRouter',
  'rebalanceCoordinator',
  'serviceDefinitionsOwner',
]);

const LOG_MSG = Object.freeze({
  STARTED: 'Started runtime-service rebalancer for active service',
  STOPPED: 'Stopped runtime-service rebalancer for removed service',
  TEARDOWN_FAILED: 'Runtime-service rebalancer teardown failed',
  PARTITION_SERVICE_MISSING:
    'service_definitions partition service not found; ' +
    'runtime-service owner will not be leadership-gated (inert)',
  BINDING_COMPILE_FAILED:
    'Binding desired-service compilation failed closed',
});

class RuntimeServiceRebalancerOwner {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {Object} options.systemTableCache
   * @param {Object} options.cdcIntegrationService
   * @param {Object} options.tablePolicyService
   * @param {Object} options.messageRouter
   * @param {Object} options.rebalanceCoordinator
   * @param {Function} [options.createRebalancer] - Injectable rebalancer
   *   factory (tests); defaults to `new UnifiedRebalancer(opts)`.
   * @throws {DependencyError} If a required dependency is missing.
   */
  constructor(options = {}) {
    for (const dependency of REQUIRED_DEPENDENCIES) {
      if (!options[dependency]) {
        throw new DependencyError(
          RUNTIME_SERVICE_REBALANCER_OWNER_NAME, dependency,
        );
      }
    }
    this.nodeId = options.nodeId;
    this.systemTableCache = options.systemTableCache;
    this.cdcIntegrationService = options.cdcIntegrationService;
    this.tablePolicyService = options.tablePolicyService;
    this.messageRouter = options.messageRouter;
    this.rebalanceCoordinator = options.rebalanceCoordinator;
    this.serviceDefinitionsOwner = options.serviceDefinitionsOwner;
    this._createRebalancer = typeof options.createRebalancer === 'function' ?
      options.createRebalancer :
      (rebalancerOptions) => new UnifiedRebalancer(rebalancerOptions);
    this._rebalancers = new Map();
    this._isLeader = false;
    this._shuttingDown = false;
    this._bindingRefreshPromise = Promise.resolve();
    this._bindingRefreshRunning = false;
    this._bindingRefreshRequested = false;
    this._bindingReconcileTimer = null;
    this._reconciledRequestDefinitions = new Map();
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(SUBSYSTEM_NAME) : console;
    // Reconcile on every service_definitions cache change so services
    // deployed AFTER leadership attach get an owner (and deleted ones are
    // quiesced) without waiting for a leadership move. refresh() no-ops
    // while not leader, so the subscription is safe on every node.
    this._cacheChangeListener = (tableName) => {
      if (tableName === SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS ||
          tableName === SYSTEM_TABLE_NAME.SERVICE_BINDINGS) {
        this.refresh();
      }
    };
    if (typeof this.systemTableCache.onCacheChange === 'function') {
      this.systemTableCache.onCacheChange(this._cacheChangeListener);
    }
  }

  /**
   * Drive leadership. While leader the owner maintains one rebalancer per active
   * runtime service; while not leader it quiesces all so exactly one node plans.
   * @param {boolean} isLeader
   */
  setLeader(isLeader) {
    if (this._shuttingDown) {
      return;
    }
    this._isLeader = isLeader === true;
    if (this._isLeader) {
      this._startBindingReconcileTimer();
      this.refresh();
    } else {
      this._stopBindingReconcileTimer();
      this._reconciledRequestDefinitions.clear();
      this._quiesceAll();
    }
  }

  /**
   * Reconcile the owned-rebalancer set to the current active RUNTIME_SERVICE
   * definitions. No-op unless this node is the leader. Idempotent — safe to call
   * on every `service_definitions` change while leader so newly-deployed services
   * get an owner and removed ones are quiesced.
   */
  refresh() {
    if (this._shuttingDown || !this._isLeader) {
      return;
    }
    this._reconcileRebalancerSet();
    this._scheduleBindingRefresh();
  }

  _reconcileRebalancerSet() {
    if (this._shuttingDown || !this._isLeader) {
      return;
    }
    const activeServiceIds = this._listActiveRuntimeServiceIds();
    const removed = [];
    for (const serviceId of this._rebalancers.keys()) {
      if (!activeServiceIds.has(serviceId)) {
        removed.push(serviceId);
      }
    }
    for (const serviceId of removed) {
      this._stopRebalancer(serviceId);
    }
    for (const serviceId of activeServiceIds) {
      if (!this._rebalancers.has(serviceId)) {
        this._startRebalancer(serviceId);
      }
    }
  }

  /**
   * Stop all rebalancing and release the owner. Shutdown-aware: further
   * {@link setLeader} calls are ignored.
   */
  shutdown() {
    this._shuttingDown = true;
    this._isLeader = false;
    this._stopBindingReconcileTimer();
    this._reconciledRequestDefinitions.clear();
    if (typeof this.systemTableCache.offCacheChange === 'function') {
      this.systemTableCache.offCacheChange(this._cacheChangeListener);
    }
    this._quiesceAll();
  }

  _startBindingReconcileTimer() {
    if (this._bindingReconcileTimer) return;
    this._bindingReconcileTimer = setInterval(
      () => this.refresh(), BINDING_RECONCILE_INTERVAL_MS,
    );
    if (typeof this._bindingReconcileTimer.unref === 'function') {
      this._bindingReconcileTimer.unref();
    }
  }

  _stopBindingReconcileTimer() {
    if (!this._bindingReconcileTimer) return;
    clearInterval(this._bindingReconcileTimer);
    this._bindingReconcileTimer = null;
  }

  _scheduleBindingRefresh() {
    if (this._shuttingDown || !this._isLeader) {
      return this._bindingRefreshPromise;
    }
    this._bindingRefreshRequested = true;
    if (this._bindingRefreshRunning) return this._bindingRefreshPromise;
    this._bindingRefreshRunning = true;
    this._bindingRefreshPromise = (async () => {
      while (this._bindingRefreshRequested &&
          this._isLeader && !this._shuttingDown) {
        this._bindingRefreshRequested = false;
        await this._compileBindings();
      }
    })().finally(() => {
      this._bindingRefreshRunning = false;
      this._reconcileRebalancerSet();
    });
    return this._bindingRefreshPromise;
  }

  async _compileBindings() {
    const rows = this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
      (binding) => supportsBindingServiceDefinitionSourceKind(
        binding?.source_kind,
      ),
    );
    const bindings = (Array.isArray(rows) ? rows : [])
      .slice()
      .sort((left, right) =>
        String(left?.binding_version_id || '')
          .localeCompare(String(right?.binding_version_id || '')));
    const reconciledRequestDefinitions = new Map();
    for (const bindingRow of bindings) {
      if (!this._isLeader || this._shuttingDown) return;
      try {
        const result =
          await this.serviceDefinitionsOwner.reconcileRequestBinding(bindingRow);
        const definition = result?.serviceDefinition;
        if (definition?.[SERVICE_DEFINITION_COLUMN.STATUS] ===
              WASM_SERVICE_DEFINITION_STATUS.ACTIVE &&
            getBindingServiceDefinitionSourceKind(definition) ===
              DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST) {
          reconciledRequestDefinitions.set(
            definition[SERVICE_DEFINITION_COLUMN.SERVICE_ID],
            definition,
          );
        }
      } catch (error) {
        this.logger.warn(LOG_MSG.BINDING_COMPILE_FAILED, {
          bindingVersionId: bindingRow?.binding_version_id || null,
          code: error?.code || null,
          error: error?.message,
          nodeId: this.nodeId,
        });
      }
    }
    if (this._isLeader && !this._shuttingDown) {
      this._reconciledRequestDefinitions = reconciledRequestDefinitions;
    }
  }

  waitForBindingRefresh() {
    return this._bindingRefreshPromise;
  }

  /**
   * @return {Set<string>} Active RUNTIME_SERVICE definition ids.
   * @private
   */
  _listActiveRuntimeServiceIds() {
    const rows = this.systemTableCache.filter(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      (definition) =>
        definition?.[SERVICE_DEFINITION_COLUMN.STATUS] ===
          WASM_SERVICE_DEFINITION_STATUS.ACTIVE &&
        (
          !hasRequestBindingServiceDefinitionLineage(definition) ||
          this._isReconciledRequestDefinition(definition)
        ),
    );
    const serviceIds = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      const serviceId = row?.[SERVICE_DEFINITION_COLUMN.SERVICE_ID];
      if (typeof serviceId === TYPEOF_STRING && serviceId.length > 0) {
        serviceIds.add(serviceId);
      }
    }
    return serviceIds;
  }

  _isReconciledRequestDefinition(definition) {
    if (getBindingServiceDefinitionSourceKind(definition) !==
        DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST) {
      return false;
    }
    const serviceId = definition?.[SERVICE_DEFINITION_COLUMN.SERVICE_ID];
    const reconciled = this._reconciledRequestDefinitions.get(serviceId);
    return requestBindingServiceDefinitionRowsMatch(definition, reconciled);
  }

  /**
   * @param {string} serviceId
   * @private
   */
  _startRebalancer(serviceId) {
    const rebalancer = this._createRebalancer({
      entityId: serviceId,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      systemTableCache: this.systemTableCache,
      cdcIntegrationService: this.cdcIntegrationService,
      tablePolicyService: this.tablePolicyService,
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      sqlQueryEngine: this.cdcIntegrationService?.sqlQueryEngine || null,
      rebalanceCoordinator: this.rebalanceCoordinator,
    });
    rebalancer.initialize();
    rebalancer.setLeader(true);
    this._rebalancers.set(serviceId, rebalancer);
    this.logger.info(LOG_MSG.STARTED, {nodeId: this.nodeId, serviceId});
  }

  /**
   * @param {string} serviceId
   * @private
   */
  _stopRebalancer(serviceId) {
    const rebalancer = this._rebalancers.get(serviceId);
    if (!rebalancer) {
      return;
    }
    this._teardownRebalancer(rebalancer);
    this._rebalancers.delete(serviceId);
    this.logger.info(LOG_MSG.STOPPED, {nodeId: this.nodeId, serviceId});
  }

  /** @private */
  _quiesceAll() {
    for (const rebalancer of this._rebalancers.values()) {
      this._teardownRebalancer(rebalancer);
    }
    this._rebalancers.clear();
  }

  /**
   * Quiesce one rebalancer, isolating teardown failures so a single throwing
   * shutdown cannot strand the remaining rebalancers' teardown.
   * @param {Object} rebalancer
   * @private
   */
  _teardownRebalancer(rebalancer) {
    try {
      rebalancer.setLeader(false);
      rebalancer.shutdown();
    } catch (error) {
      this.logger.warn(LOG_MSG.TEARDOWN_FAILED, {
        nodeId: this.nodeId,
        error: error?.message,
      });
    }
  }
}

/**
 * @param {Object} partitionServices - Map of replicaId -> PartitionService.
 * @param {string} partitionId
 * @return {?Object} The first PartitionService for partitionId, or null.
 */
function resolvePartitionServiceByPartitionId(partitionServices, partitionId) {
  if (!partitionServices ||
      typeof partitionServices.values !== 'function') {
    return null;
  }
  for (const service of partitionServices.values()) {
    if (service && service.partitionId === partitionId) {
      return service;
    }
  }
  return null;
}

/**
 * Construct the runtime-service rebalancer owner and bind it to the
 * `service_definitions-p1` partition's leadership, so it plans only on the node
 * that leads the desired-state table (the proven cluster-singleton, off the
 * priority lane). Idempotent enough to call once per node on the seed and join
 * paths after the runtime-service handler is set up.
 *
 * @param {Object} options - RuntimeServiceRebalancerOwner deps plus
 *   {Object} options.partitionServices.
 * @return {{owner: RuntimeServiceRebalancerOwner,
 *   partitionService: ?Object, detach: function(): void}}
 */
function attachRuntimeServiceRebalancerOwner(options = {}) {
  const owner = new RuntimeServiceRebalancerOwner(options);
  const partitionId =
    INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS];
  // LEVEL-TRIGGERED sink wiring: at composition time this node may not
  // yet host a service_definitions-p1 replica (only the seed does
  // during formation; the other replicas are created later by the
  // rebalancer). An attach-time-only resolution left every non-seed
  // owner permanently inert — the moment leadership moved off the
  // seed, NO node planned runtime services (observed live: 4/5 owners
  // logged PARTITION_SERVICE_MISSING and the cluster lost its planning
  // singleton on the first leadership move). Retry the resolution on a
  // modest unref'd interval until the local replica exists, then wire
  // the leadership sink; leadership gating itself stays with the
  // partition service (the single owner of that decision).
  let partitionService = null;
  let retryTimer = null;
  const tryWireSink = () => {
    if (partitionService) {
      return true;
    }
    const resolved = resolvePartitionServiceByPartitionId(
      options.partitionServices, partitionId,
    );
    if (resolved &&
        typeof resolved.setRebalancerLeadershipSink === 'function') {
      partitionService = resolved;
      partitionService.setRebalancerLeadershipSink(owner);
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
      return true;
    }
    return false;
  };
  if (!tryWireSink()) {
    owner.logger.warn(LOG_MSG.PARTITION_SERVICE_MISSING, {partitionId});
    retryTimer = setInterval(tryWireSink, SINK_WIRING_RETRY_INTERVAL_MS);
    if (typeof retryTimer.unref === 'function') {
      retryTimer.unref();
    }
  }
  return {
    owner,
    get partitionService() {
      return partitionService;
    },
    detach() {
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
      if (partitionService &&
          typeof partitionService.setRebalancerLeadershipSink === 'function') {
        partitionService.setRebalancerLeadershipSink(null);
      }
      owner.shutdown();
    },
  };
}

export {RuntimeServiceRebalancerOwner, attachRuntimeServiceRebalancerOwner};
