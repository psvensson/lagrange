import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  projectRuntimeReplicaServicesRow,
} from './runtime-replica-state-projection.js';
import {initializeSqlQueryEngineInstance} from
  './sql-query-engine-instance-initializer.js';
import {releaseTransactionReservations} from
  '../partition/partition-locking-read-reservation.js';

const LOCAL_STR_FUNCTION = 'function';
const RUNTIME_ACCESS_POLICY_DENIED_STATUS = 'denied';
const RUNTIME_ACCESS_POLICY_OWNER_UNAVAILABLE =
  'policy_owner_unavailable';

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  LoggingService,
  MigrationCoordinator,
  MigrationPipeline,
  QUERY_LOG_MSG,
  QUERY_SUBSYSTEM,
} = SQL_QUERY_ENGINE_SHARED;

function resumeDurableProvisioningWork(engine) {
  void engine.tableCreationService.resumeDurableProvisioningJobs?.()
    .catch((error) => engine.logger.warn(
      QUERY_LOG_MSG.SCHEMA_PROVISIONING_RECOVERY_DEFERRED,
      {error: error.message},
    ));
}

class SQLQueryEngineLifecycleAndCallbackDispatch {
  constructor(options = {}) {
    initializeSqlQueryEngineInstance(this, options);
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(QUERY_SUBSYSTEM.SQL_QUERY_ENGINE);
      }
    } catch (logErr) {
      console.warn(QUERY_LOG_MSG.INIT_LOGGER_FAILED, logErr);
    }
    return console;
  }

  /**
   * Set the system cache.
   * @param {Object} cache - System table cache.
   */
  setSystemCache(cache) {
    this.systemCache = cache;
    this.partitionResolver.setSystemCache(cache);
    this.tableCreationService.setSystemCache(cache);
    this.queryExecutor.setSystemCache(cache);
    if (this.migrationCoordinator) {
      this.migrationCoordinator.systemTableCache = cache;
    } else if (cache && this.migrationAutoWireEnabled) {
      this.migrationCoordinator = new MigrationCoordinator({
        sqlCore: this,
        systemTableCache: cache,
        transactionCoordinator: this.transactionCoordinator,
        logger: this.logger,
        now: this.nowFn,
      });
      if (!this.migrationPipeline) {
        this.migrationPipeline = new MigrationPipeline({
          migrationCoordinator: this.migrationCoordinator,
          logger: this.logger,
        });
      }
    }
    if (this.distributedTransactionRecoveryActivated) {
      void this.activateDistributedTransactionRecovery({
        resetRecoveryState: true,
      });
    }
  }

  /**
   * Activate distributed transaction recovery replay and periodic sweeps.
   * Joining nodes use this to defer replay until the READY cutover completes.
   *
   * @param {Object} [options]
   * @param {boolean} [options.resetRecoveryState=true] - When true, reload the
   *   recovered coordinator view from the latest system-cache snapshot.
   * @return {Promise<Object>} Replay summary.
   */
  activateDistributedTransactionRecovery(options = {}) {
    this.distributedTransactionRecoveryActivated = true;
    const resetRecoveryState = options.resetRecoveryState !== false;
    if (resetRecoveryState) {
      this.transactionStateRecovered = false;
    }
    this.recoverDistributedTransactionStateFromCache();
    const replayPromise = this.resumeRecoveredDistributedTransactions();
    resumeDurableProvisioningWork(this);
    if (typeof this.transactionCoordinator.startRecoverySweep === LOCAL_STR_FUNCTION) {
      this.transactionCoordinator.startRecoverySweep();
    }
    return replayPromise;
  }

  /**
   * Set the message router for query routing.
   * @param {Object} router - Message router instance.
   */
  setMessageRouter(router) {
    this.messageRouter = router;
    this.queryExecutor.setMessageRouter(router);
  }

  /**
   * Set canonical readiness owner used for serve-routing decisions.
   * @param {Object|null} readinessService
   */
  setControlPlaneReadinessService(readinessService) {
    this.controlPlaneReadinessService = readinessService || null;
    this.queryExecutor.setControlPlaneReadinessService(
      this.controlPlaneReadinessService,
    );
  }

  /**
   * Set the default readiness dimension used for routed partition work.
   * @param {string} readinessDimension
   */
  setDefaultRoutingReadinessDimension(readinessDimension) {
    this.defaultRoutingReadinessDimension =
      readinessDimension || CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
    this.queryExecutor.setDefaultRoutingReadinessDimension(
      this.defaultRoutingReadinessDimension,
    );
  }

  /**
   * Set the CDC integration service.
   * @param {Object} service - CDC integration service.
   */
  setCDCIntegrationService(service) {
    this.cdcIntegrationService = service;
    this.tableCreationService.setCDCIntegrationService(service);
  }

  /**
   * Set the sole runtime table-authorization owner.
   * @param {Object|null} owner
   */
  setRuntimeAccessPolicyOwner(owner) {
    this.runtimeAccessPolicyOwner = owner || null;
  }

  getControlPlaneSystemTableGateway() {
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Set rebalance coordinator used for table partition provisioning.
   * @param {Object} coordinator - RebalanceCoordinator instance.
   */
  setRebalanceCoordinator(coordinator) {
    this.rebalanceCoordinator = coordinator || null;
    if (this.rebalanceCoordinator?.controlPlaneReadinessService) {
      this.setControlPlaneReadinessService(
        this.rebalanceCoordinator.controlPlaneReadinessService,
      );
    }
  }

  /**
   * Set initial table partition provisioner callback.
   * @param {Function} provisioner - Provisioning callback.
   */
  setTablePartitionProvisioner(provisioner) {
    this.tableCreationService.setPartitionProvisioner(provisioner);
  }

  /**
   * Set partition split/merge manager integration owner.
   * @param {Object} manager - PartitionSplitMergeManager instance.
   */
  setPartitionSplitMergeManager(manager) {
    this.partitionSplitMergeManager = manager || null;
    this.tableCreationService.setPartitionSplitMergeManager(manager);
  }

  /**
   * Set schema migration pipeline.
   * @param {Object|null} pipeline - Migration pipeline adapter.
   */
  setMigrationPipeline(pipeline) {
    this.migrationPipeline = pipeline || null;
  }

  /**
   * Set schema migration coordinator owner.
   * @param {Object|null} coordinator - Migration coordinator owner.
   */
  setMigrationCoordinator(coordinator) {
    this.migrationCoordinator = coordinator || null;
    if (
      !this.migrationPipeline &&
      this.migrationAutoWireEnabled &&
      this.migrationCoordinator
    ) {
      this.migrationPipeline = new MigrationPipeline({
        migrationCoordinator: this.migrationCoordinator,
        logger: this.logger,
      });
    }
  }

  /**
   * Release remaining transaction reservations on shutdown.
   */
  releasePendingReservations() {
    const transactions = this.transactionCoordinator?.transactionsBySession;
    if (!transactions) return;
    for (const tx of transactions.values()) {
      releaseTransactionReservations(tx.transactionId);
    }
  }

  /**
   * Shutdown lifecycle-owned query services.
   * @return {Promise<void>}
   */
  async shutdown() {
    // Abort in-flight query retry loops so they stop re-arming backoff timers
    // (otherwise a query retrying a torn-down cluster keeps the loop alive).
    if (
      this.queryExecutor &&
      typeof this.queryExecutor.markShuttingDown === LOCAL_STR_FUNCTION
    ) {
      this.queryExecutor.markShuttingDown();
    }
    if (
      this.servicePartitionAccessPublisher &&
      typeof this.servicePartitionAccessPublisher.stop === LOCAL_STR_FUNCTION
    ) {
      this.servicePartitionAccessPublisher.stop();
    }
    if (
      this.transactionCoordinator &&
      typeof this.transactionCoordinator.stopRecoverySweep === LOCAL_STR_FUNCTION
    ) {
      this.transactionCoordinator.stopRecoverySweep();
    }
    this.releasePendingReservations();
    if (
      this.tableCreationService &&
      typeof this.tableCreationService.shutdown === LOCAL_STR_FUNCTION
    ) {
      await this.tableCreationService.shutdown();
    }
    if (
      this.runtimeReplicaStateProjectionOwner &&
      typeof this.runtimeReplicaStateProjectionOwner.shutdown ===
        LOCAL_STR_FUNCTION
    ) {
      this.runtimeReplicaStateProjectionOwner.shutdown();
    }
  }

  /**
   * Set runtime driver registry.
   * @param {Object} registry - Runtime driver registry.
   */
  setRuntimeDriverRegistry(registry) {
    this.runtimeDriverRegistry = registry;
  }

  /**
   * Set unified runtime lifecycle owner.
   * @param {Object} lifecycle - Service runtime lifecycle.
   */
  setServiceRuntimeLifecycle(lifecycle) {
    this.serviceRuntimeLifecycle = lifecycle;
    this._wireQueryExecutorFactory(lifecycle);
    this._wireStateProjectionWriter(lifecycle);
  }

  /**
   * Wire the runtime replica state projection into the lifecycle
   * owner so placed replicas become visible as authoritative
   * services-table rows (the rebalancer's currentReplicas view and
   * every observer read that table). Create-once-then-update
   * discipline: the first projection for a replica INSERTs the row
   * with its identity columns; every later transition UPDATEs the
   * existing row primary-key addressed (never INSERT OR REPLACE).
   *
   * @param {Object} lifecycle - Service runtime lifecycle.
   * @private
   */
  _wireStateProjectionWriter(lifecycle) {
    if (
      !lifecycle ||
      typeof lifecycle.setStateProjectionWriter !== LOCAL_STR_FUNCTION
    ) {
      return;
    }
    const retainedProjectionOwner =
      this.runtimeReplicaStateProjectionOwner;
    lifecycle.setStateProjectionWriter(
      retainedProjectionOwner &&
      typeof retainedProjectionOwner.submit === LOCAL_STR_FUNCTION ?
        (serviceId, stateRow, context) =>
          retainedProjectionOwner.submit(serviceId, stateRow, context) :
        async (serviceId, stateRow) =>
          this.projectRuntimeReplicaServicesRow(serviceId, stateRow),
    );
  }

  /**
   * Persist one runtime replica lifecycle state into the services
   * table.
   * @param {string} serviceId - Replica service id (row primary key).
   * @param {Object} stateRow - Column values from the lifecycle.
   * @return {Promise<void>}
   */
  async projectRuntimeReplicaServicesRow(serviceId, stateRow) {
    await projectRuntimeReplicaServicesRow(
      this.controlPlaneSystemTableGateway,
      this.nodeId,
      serviceId,
      stateRow,
    );
  }

  /**
   * Wire a service-scoped query executor factory into the
   * lifecycle owner so service replicas can query tables
   * through the standard SQL execution path.
   *
   * The factory produces closures that call executeQuery
   * with a session scoped to the service identity.
   *
   * @param {Object} lifecycle - Service runtime lifecycle.
   * @private
   */
  _wireQueryExecutorFactory(lifecycle) {
    if (!lifecycle || typeof lifecycle.setQueryExecutorFactory !== LOCAL_STR_FUNCTION) {
      return;
    }
    lifecycle.setQueryExecutorFactory((serviceId) => {
      const queryExecutor = async (sql, params) =>
        this.executeQuery(sql, params, {
          sessionId: serviceId,
          issuingServiceId: serviceId,
        });
      // Runtime-internal coordination must not distort the service's
      // data-affinity matrix. It shares the normal SQL path and session
      // but deliberately omits issuingServiceId attribution.
      queryExecutor.executeInternal = (sql, params, options = {}) =>
        this.executeQuery(sql, params, {
          ...options,
          sessionId: serviceId,
        });
      queryExecutor.executeRequest = (request) =>
        this.executeRequest(request, {issuingServiceId: serviceId});
      queryExecutor.getRuntimeAccessPolicy = () =>
        this.runtimeAccessPolicyOwner?.getRuntimePolicy(serviceId) ||
        Promise.resolve(Object.freeze({
          status: RUNTIME_ACCESS_POLICY_DENIED_STATUS,
          reason: RUNTIME_ACCESS_POLICY_OWNER_UNAVAILABLE,
        }));
      return queryExecutor;
    });
  }

  /**
   * Set debug session resolver for callback trace gating.
   * @param {Object} resolver
   */
  setDebugSessionResolver(resolver) {
    this.debugSessionResolver = resolver;
  }

  /**
   * Set trace collector for callback trace streaming.
   * @param {Object} collector
   */
  setTraceCollector(collector) {
    this.traceCollector = collector;
  }

  /**
   * Set wasm executor.
   * @param {Object} wasmExecutor - WasmExecutor instance.
   */
  setWasmExecutor(wasmExecutor) {
    this.wasmExecutor = wasmExecutor || null;
  }
}

export {SQLQueryEngineLifecycleAndCallbackDispatch};
