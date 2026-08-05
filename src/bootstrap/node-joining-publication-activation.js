import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {NodeJoiningCdcSubscriptionAndBackfill} from './node-joining-cdc-subscription-and-backfill.js';
import {
  attachRuntimeServiceRebalancerOwner,
} from './shared/runtime-service-rebalancer-setup.js';
import {
  attachSnapshotCatchupDispatcher,
} from './shared/snapshot-catchup-wiring.js';

const {
  CACHE_HYDRATION_TABLES,
  CDCIntegrationSetup,
  CONTROL_PLANE_READINESS_DIMENSION,
  ControlPlaneSetup,
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  JOINING_UNIFIED_RECONCILE,
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
  LatencyTopologySetup,
  MessageGroupServiceHandlerSetup,
  NODE_JOINING_SERVICE_LITERAL,
  NodeService,
  PartitionService,
  PgWireStartupSafetyGate,
  ReplicaHandlerSetup,
  ReplicaStatus,
  RuntimeServiceHandlerSetup,
  SERVICE_TYPE,
  SQLQueryEngine,
  STARTUP_JOIN_MODE,
  STRING,
  TablePolicyService,
  UNIFIED_SERVICE_TYPE,
  assertCritical,
  buildDurableRejoinPartitionRestorePlans,
  buildPartitionCdcPropagationSubscriber,
  formatReplicatedServiceAddress,
  shouldAttachPartitionCdcPropagation,
  wireMigrationWorkflowOwners,
} = NODE_JOINING_SERVICE_SHARED;

class NodeJoiningPublicationActivation extends NodeJoiningCdcSubscriptionAndBackfill {
  /**
   * Restore durable local partition runtimes from hydrated system metadata
   * before join admission writes depend on canonical partition leadership.
   * @param {Object} systemTableCache
   * @return {Promise<Object[]>}
   * @private
   */
  async restoreDurableRejoinLocalPartitionServices(systemTableCache) {
    if (this.startupMode !== STARTUP_JOIN_MODE.DURABLE_REJOIN) {
      this.durableRejoinRestoreState =
        JOIN_REJOIN_PROMOTION_RESTORE_STATE.NOT_APPLICABLE;
      return [];
    }
    const restorePlans = buildDurableRejoinPartitionRestorePlans({
      systemTableCache,
      nodeId: this.nodeId,
      dataDir: this.dataDir,
      logger: this.logger,
    });
    if (restorePlans.length === 0) {
      this.durableRejoinRestoreState =
        JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED;
      return [];
    }
    this.durableRejoinRestoreState =
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING;
    await this.initializeJoiningLifecycleOwners();
    for (const restorePlan of restorePlans) {
      this.queueJoinServiceReplica(
        this.createJoinServiceDescriptor(
          UNIFIED_SERVICE_TYPE.PARTITION,
          restorePlan.replicaId,
        ),
        restorePlan,
      );
    }
    await this.triggerJoinReconciler(
      JOINING_UNIFIED_RECONCILE.HYDRATION_REASON,
    );
    await this.ensureDurableRejoinPartitionRuntimes(restorePlans);
    await this.activateJoinPartitionServiceRows(
      restorePlans.map(({replicaId}) => replicaId),
    );
    this.startDurableRejoinLocalPartitionElections(restorePlans);
    this.durableRejoinRestoreState =
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED;
    this.logger.info(
      NODE_JOINING_SERVICE_LITERAL.RESTORED_DURABLE_LOCAL_PARTITION_SERVICES_FROM_CACHED_TOPOLOGY,
      {
        nodeId: this.nodeId,
        restoredReplicaCount: restorePlans.length,
        restoredPartitionIds: restorePlans.map(
          ({partitionId}) => partitionId,
        ),
      },
    );
    return restorePlans;
  }
  /**
   * Ensure the restore batch has concrete local runtimes before publication.
   * The generic reconciler records action failures without throwing; durable
   * rejoin owns this exact-runtime invariant before activating service rows.
   * @param {Object[]} restorePlans
   * @return {Promise<void>}
   * @private
   */
  async ensureDurableRejoinPartitionRuntimes(restorePlans = []) {
    for (const restorePlan of restorePlans) {
      const replicaId = restorePlan?.replicaId;
      if (typeof replicaId !== 'string' || replicaId.length === 0) {
        continue;
      }
      const partition = this.partitionServices.get(replicaId);
      if (partition && partition.initialized !== false) {
        continue;
      }
      await this.createJoinPartitionReplica({replicaOptions: restorePlan});
      const readyPartition = this.partitionServices.get(replicaId);
      assertCritical(
        readyPartition && readyPartition.initialized !== false,
        `Durable rejoin restore requires initialized partition runtime for ${replicaId}`,
      );
    }
  }
  /**
   * Start elections for restored durable partition replicas once the batch
   * has been recreated locally.
   * @param {Object[]} restorePlans
   * @return {void}
   * @private
   */
  startDurableRejoinLocalPartitionElections(restorePlans = []) {
    for (const restorePlan of restorePlans) {
      const replicaId = restorePlan?.replicaId;
      if (typeof replicaId !== 'string' || replicaId.length === 0) {
        continue;
      }
      const partition = this.partitionServices.get(replicaId);
      if (typeof partition?.startElection === 'function') {
        partition.startElection();
      }
    }
  }
  /**
   * Initialize the ReplicaHandler to handle CREATE_REPLICA/REMOVE_REPLICA.
   * Requirements: 3.1, 3.2 - Use MessageRouter directly for all communication.
   * @private
   */
  initializeReplicaHandler() {
    const messageGroupService = this.getLeaderMessageGroupService();
    if (!this.messageRouter) {
      this.logger.error(JOINING_LOG_MSG.REPLICA_HANDLER_ROUTER_MISSING, {
        nodeId: this.nodeId,
      });
      throw new Error(JOINING_ERROR_MSG.REPLICA_HANDLER_ROUTER_REQUIRED);
    }
    const cdcIntegrationService = this.createCdcIntegrationService();
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    if (!this.tablePolicyService) {
      this.tablePolicyService = new TablePolicyService({
        systemTableCache: systemTableCache,
        cdcIntegrationService: cdcIntegrationService,
      });
      this.tablePolicyService.initialize();
    }
    const createPartitionService = async (options) =>
      this.createJoinLocalPartitionService({...options, messageGroupService}); // Use shared ReplicaHandlerSetup component
    const {replicaHandler, replicaStateMachine} = ReplicaHandlerSetup.create({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      cdcIntegrationService: cdcIntegrationService,
      systemTableCache: systemTableCache,
      createPartitionService: createPartitionService,
      dataDir: this.dataDir,
      rpcClient: this.rpcClient,
      executorOutcomeEmitter:
        this.rebalanceCoordinator?.executorOutcomeEmitter,
    });
    this.replicaHandler = replicaHandler;
    this.replicaStateMachine = replicaStateMachine;
    this.logger.info(JOINING_LOG_MSG.REPLICA_HANDLER_READY, {
      nodeId: this.nodeId,
      hasMessageGroupService: !!messageGroupService,
    });
  }
  /**
   * Create and initialize one local partition service on the join path.
   * Shared by the replica handler and durable-rejoin restore lifecycle.
   * @param {Object} options
   * @return {Promise<PartitionService>}
   * @private
   */
  async createJoinLocalPartitionService(options) {
    const cdcIntegrationService = this.createCdcIntegrationService();
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    if (!this.tablePolicyService) {
      this.tablePolicyService = new TablePolicyService({
        systemTableCache,
        cdcIntegrationService,
      });
      this.tablePolicyService.initialize();
    }
    const cacheForPartition = this.systemCacheHydrated ?
      systemTableCache :
      null;
    const messageGroupService =
      options.messageGroupService || this.getLeaderMessageGroupService();
    const partition = new PartitionService({
      ...options,
      transport: this.transport,
      messageGroupService,
      messageRouter: this.messageRouter,
      rebalanceCoordinator: this.rebalanceCoordinator,
      replicaStateMachine: this.replicaStateMachine,
      systemTableCache: cacheForPartition,
      cdcIntegrationService,
      sqlQueryEngine: cdcIntegrationService?.sqlQueryEngine || null,
      tablePolicyService: this.tablePolicyService,
      bootstrapReadinessState: this.bootstrapReadinessState,
    });
    await partition.initialize();
    // S6: durable-rejoin restores bypass the ReplicaHandler factory wrapper,
    // so the dispatcher seam attaches here for every join-built service.
    attachSnapshotCatchupDispatcher({service: partition,
      systemTableCache, messageRouter: this.messageRouter});
    this.partitionServices.set(options.replicaId, partition);
    this.trackJoinPartitionReplica(
      options.replicaId,
      options.partitionId,
      partition,
    );
    const tableName = options.tableName;
    if (tableName && shouldAttachPartitionCdcPropagation(tableName)) {
      const attachCdcPropagation = async () => {
        const subscriptionSelection =
          await this.resolveOperationalMessageGroupSelectionAsync({
            requiredTables: [tableName],
            preferredService: messageGroupService,
            reuseCapturedIngress: true,
          });
        const subscriptionMessageGroupService = subscriptionSelection.service;
        if (!subscriptionMessageGroupService) {
          throw this.buildMessageGroupOwnerNotReadyError(
            subscriptionSelection,
            {
              message:
                NODE_JOINING_SERVICE_LITERAL
                  .OPERATIONAL_MESSAGE_GROUP_CDC_INGRESS_NOT_READY +
                `for ${tableName} CDC subscription`,
            },
          );
        }
        await subscriptionMessageGroupService.subscribeToCDC(tableName);
        const subscriberId = [
          'joining',
          this.nodeId,
          tableName,
          options.replicaId,
          subscriptionMessageGroupService?.groupId || 'message-group',
        ].join(':');
        const cdcSubscriber = buildPartitionCdcPropagationSubscriber({
          tableName,
          partitionId: options.partitionId,
          replicaId: options.replicaId,
          logger: this.logger,
          eventLogMessage: JOINING_LOG_MSG.CDC_EVENT_RECEIVED,
          preferredService: subscriptionMessageGroupService,
          resolveOperationalMessageGroupSelection: (selectionOptions = {}) =>
            this.resolveOperationalMessageGroupSelection(selectionOptions),
          resolveOperationalMessageGroupSelectionAsync:
            (selectionOptions = {}) =>
              this.resolveOperationalMessageGroupSelectionAsync(
                selectionOptions,
              ),
          buildMessageGroupOwnerNotReadyError: (selection, errorOptions) =>
            this.buildMessageGroupOwnerNotReadyError(selection, errorOptions),
          propagatePartitionCDCEvent: (messageGroupService, cdcEvent) =>
            this.propagatePartitionCDCEvent(messageGroupService, cdcEvent),
        });
        const handshake = await partition.subscribeToCDCWithHandshake(
          cdcSubscriber,
          {subscriberId},
        );
        this.logger.debug(JOINING_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
          tableName,
          partitionId: options.partitionId,
          replicaId: options.replicaId,
          subscriberId: handshake.subscriberId,
          subscriptionEpoch: handshake.subscriptionEpoch,
          catchupMode: handshake.catchup.mode,
          bufferedEventsReplayed: handshake.catchup.bufferedEventsReplayed,
        });
      };
      if (options.deferCdcPropagationHandshake === true) {
        attachCdcPropagation().catch((error) => {
          this.logger.error(JOINING_LOG_MSG.CDC_SUBSCRIPTION_FAILED, {
            tableName,
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            error: error?.message || String(error),
          });
        });
      } else {
        await attachCdcPropagation();
      }
    }
    return partition;
  }
  /**
   * Register one locally restored partition with replica-handler recovery state.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {Object} partition
   * @return {void}
   * @private
   */
  trackJoinPartitionReplica(replicaId, partitionId, partition) {
    if (!this.replicaHandler) {
      return;
    }
    this.replicaHandler.localServices?.set?.(replicaId, partition);
    this.replicaHandler.setLocalReplica?.(replicaId, {
      replicaId,
      partitionId,
      status: ReplicaStatus.ACTIVE,
      service: partition,
    });
    this.replicaHandler.replicaStateMachine?.registerReplicaSnapshot?.(
      replicaId,
      {
        partitionId,
        nodeId: this.nodeId,
        state: ReplicaStatus.ACTIVE,
        serviceId: replicaId,
        serviceType: SERVICE_TYPE.PARTITION,
        serviceAddress:
          typeof partition?.getUnifiedAddress === 'function' ?
            partition.getUnifiedAddress() :
            formatReplicatedServiceAddress(
              SERVICE_TYPE.PARTITION,
              this.nodeId,
              replicaId,
            ),
      },
    );
  }
  /**
   * Initialize the control plane service for ordered registration and dispatch.
   * @private
   */
  async initializeControlPlaneService() {
    if (this.heartbeatService) {
      return;
    }
    const leaderMessageGroup = assertCritical(
      this.getLeaderMessageGroupService(),
      JOINING_ERROR_MSG.MESSAGE_GROUP_LEADER_REQUIRED,
    );
    const systemTableCache =
      leaderMessageGroup.systemTableCache ||
      NodeService.getInstance().getSystemTableCache();
    const cdcIntegrationService = this.createCdcIntegrationService();
    if (!this.tablePolicyService) {
      this.tablePolicyService = new TablePolicyService({
        systemTableCache,
        cdcIntegrationService,
      });
      this.tablePolicyService.initialize();
    } else {
      this.tablePolicyService.systemTableCache = systemTableCache;
      this.tablePolicyService.cdcIntegrationService = cdcIntegrationService;
    }
    for (const messageGroupService of this.messageGroupServices.values()) {
      assertCritical(
        messageGroupService &&
          typeof messageGroupService.subscribeToCDC === 'function',
        JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
          STRING.UNKNOWN,
          NODE_JOINING_SERVICE_LITERAL.SUBSCRIBETOCDC_NOT_AVAILABLE,
        ),
      );
      for (const tableName of CACHE_HYDRATION_TABLES) {
        try {
          await messageGroupService.subscribeToCDC(tableName);
        } catch (error) {
          this.logger.error(JOINING_LOG_MSG.CDC_SUBSCRIPTION_FAILED, {
            nodeId: this.nodeId,
            tableName,
            error: error.message,
          });
          throw new Error(
            JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
              tableName,
              error.message,
            ),
          );
        }
      }
    }
    const controlPlane = await ControlPlaneSetup.create({
      dataDir: this.dataDir,
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      bootIncarnation: this.bootIncarnation,
      advertisedNodeWsAddress: this.advertisedNodeWsAddress,
      messageRouter: this.messageRouter,
      cdcIntegrationService,
      cdcGroupPropagationService:
        this.latencyTopology?.cdcGroupPropagationService || null,
      systemTableCache,
      tablePolicyService: this.tablePolicyService,
      messageGroupServices: this.messageGroupServices,
      getLocalClusterIncarnationFence: () => this.clusterIncarnationFence,
      rebalanceCoordinator: this.rebalanceCoordinator,
      bootstrapReadinessState: this.bootstrapReadinessState,
      executorOutcomeEmitter: this.replicaHandler?.executorOutcomeEmitter,
      wasmComponentDriver: this.runtimeDrivers.wasmComponentDriver,
      controlPlaneWriteRetryTimeoutMs: this.config.controlPlaneWriteRetryTimeoutMs,
      controlPlaneWriteRetryBaseDelayMs: this.config.controlPlaneWriteRetryBaseDelayMs,
      controlPlaneWriteRetryMaxDelayMs: this.config.controlPlaneWriteRetryMaxDelayMs,
    });
    this.serviceLifecycleCommandOwner =
      controlPlane.serviceLifecycleCommandOwner;
    this.systemMetadataOwners = controlPlane.systemMetadataOwners;
    this.heartbeatService = controlPlane.heartbeatService;
    if (
      typeof this.heartbeatService?.setNodeStateReporter === 'function'
    ) {
      this.heartbeatService.setNodeStateReporter(async (payload = {}) => {
        return this.sendControlPlaneNodeStateUpdate({
          state: payload.state,
          capabilities: payload.capabilities,
          heartbeatAt: payload.heartbeatAt,
          readyLeaseExpiresAt: payload.readyLeaseExpiresAt,
          heartbeatOnly: true,
          nodeRow: payload.nodeRow,
          nodeStatePublicationMode: payload.nodeStatePublicationMode,
        });
      });
    }
    this.leaseService = controlPlane.leaseService;
    this.endpointService = controlPlane.endpointService;
    this.dispatchService = controlPlane.dispatchService;
    this.rebalanceCoordinator = controlPlane.rebalanceCoordinator;
    const resolvedExecutorOutcomeEmitter =
      this.rebalanceCoordinator?.executorOutcomeEmitter;
    if (
      this.replicaHandler &&
      resolvedExecutorOutcomeEmitter
    ) {
      this.replicaHandler.executorOutcomeEmitter =
        resolvedExecutorOutcomeEmitter;
    }
    if (
      this.messageGroupServiceHandler &&
      resolvedExecutorOutcomeEmitter
    ) {
      this.messageGroupServiceHandler.executorOutcomeEmitter =
        resolvedExecutorOutcomeEmitter;
    }
    this.runtimeSurfaceOwner.bindControlPlaneServices();
    this.logger.info(
      NODE_JOINING_SERVICE_LITERAL.CONTROL_PLANE_INITIALIZED_BY_OWNER,
      {
        nodeId: this.nodeId,
        owner: NODE_JOINING_SERVICE_LITERAL.CONTROLPLANESETUP,
        messageGroupCount: this.messageGroupServices.size,
      },
    );
  }
  /**
   * Initialize the RuntimeServiceHandler behind the PG wire safety
   * gate. The gate ensures control-plane readiness before allowing
   * runtime-service replica operations. Startup failure is isolated
   * so join completes even if PG wire fails.
   *
   * Requirements: 11.2, 11.3, 11.4
   * @private
   */
  initializeRuntimeServiceHandler() {
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    const gate = new PgWireStartupSafetyGate({
      nodeId: this.nodeId,
      serviceLifecycleManager: this.serviceLifecycleManager,
      systemTableCache,
      heartbeatService: this.heartbeatService,
    });
    const result = gate.guardedSetup(() => {
      return RuntimeServiceHandlerSetup.create({
        nodeId: this.nodeId,
        messageRouter: this.messageRouter,
        cdcIntegrationService: this.cdcIntegrationService,
        systemTableCache,
        serviceLifecycleManager: this.serviceLifecycleManager,
        serviceRuntimeLifecycle: this.serviceRuntimeLifecycle,
        rpcClient: this.rpcClient,
        executorOutcomeEmitter:
          this.rebalanceCoordinator?.executorOutcomeEmitter,
      });
    });
    if (result) {
      this.runtimeServiceHandler = result.runtimeServiceHandler;
    }
    this.attachRuntimeServiceRebalancerOwner();
  }

  /**
   * Attach the runtime-service rebalancer owner, gated on `service_definitions-p1`
   * leadership, so runtime-service replicas (e.g. the Postgres-wire endpoint) are
   * placed by the node that leads the desired-state table. Idempotent.
   * @private
   */
  attachRuntimeServiceRebalancerOwner() {
    if (this.runtimeServiceRebalancerOwnerHandle) {
      this.runtimeServiceRebalancerOwnerHandle.detach();
      this.runtimeServiceRebalancerOwnerHandle = null;
    }
    this.runtimeServiceRebalancerOwnerHandle =
      attachRuntimeServiceRebalancerOwner({
        nodeId: this.nodeId,
        systemTableCache: NodeService.getInstance().getSystemTableCache(),
        cdcIntegrationService: this.cdcIntegrationService,
        tablePolicyService: this.tablePolicyService,
        messageRouter: this.messageRouter,
        rebalanceCoordinator: this.rebalanceCoordinator,
        serviceDefinitionsOwner:
          this.systemMetadataOwners.serviceDefinitionsOwner,
        partitionServices: this.partitionServices,
      });
  }

  /**
   * Initialize the MessageGroupServiceHandler for control-plane
   * message-group replica operations.
   * @private
   */
  initializeMessageGroupServiceHandler() {
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    const descriptorForReplica = (replicaId) => ({
      serviceId: replicaId,
      serviceType: 'message_group',
      replicaId,
    });
    const result = MessageGroupServiceHandlerSetup.create({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      cdcIntegrationService: this.cdcIntegrationService,
      systemTableCache,
      createMessageGroupReplica: async (options) => {
        return this.createJoinMessageGroupReplica({
          definition: descriptorForReplica(options.replicaId),
          replicaOptions: options,
        });
      },
      startMessageGroupReplica: async (options) => {
        return this.startJoinMessageGroupReplica(
          descriptorForReplica(options.replicaId),
          {replicaOptions: options},
        );
      },
      stopMessageGroupReplica: async (options) => {
        return this.stopJoinMessageGroupReplica(
          descriptorForReplica(options.replicaId),
          {replicaOptions: options},
        );
      },
      resolveLocalMessageGroupReplica: (replicaId) =>
        this.messageGroupServices.get(replicaId) || null,
      rpcClient: this.rpcClient,
      executorOutcomeEmitter:
        this.rebalanceCoordinator?.executorOutcomeEmitter,
    });
    if (result) {
      this.messageGroupServiceHandler = result.messageGroupServiceHandler;
    }
  }
  /**
   * Create a CDC integration service for the joining node.
   * Routes system table writes through SQL query engine which transparently
   * routes to partition leaders via message router.
   * The system cache will be populated later during phaseQuerySystemState().
   * @return {CDCIntegrationService} The CDC integration service.
   * @private
   */
  createCdcIntegrationService() {
    if (this.cdcIntegrationService) {
      return this.cdcIntegrationService;
    }
    const seedNodeId = assertCritical(
      this.seedNodeId,
      JOINING_ERROR_MSG.SEED_NODE_ID_REQUIRED,
    );
    this.logger.debug(JOINING_LOG_MSG.CDC_INTEGRATION_CREATE, {
      nodeId: this.nodeId,
      seedNodeId,
    }); // Get system table cache from message group services
    let systemTableCache = null;
    let cacheMutationTarget = null;
    for (const mgService of this.messageGroupServices.values()) {
      // Get the read-only wrapper for the query engine
      if (mgService.getReadOnlyCache) {
        systemTableCache = mgService.getReadOnlyCache();
      } else if (mgService.systemTableCache) {
        systemTableCache = mgService.systemTableCache;
      }
      if (mgService.getWritableCache) {
        cacheMutationTarget = mgService.getWritableCache();
      } else if (mgService.systemTableCache) {
        cacheMutationTarget = mgService.systemTableCache;
      }
      break;
    }
    if (!systemTableCache) {
      systemTableCache = NodeService.getInstance().getSystemTableCache();
    }
    if (!cacheMutationTarget) {
      cacheMutationTarget = NodeService.getInstance().getSystemTableCache();
    }
    assertCritical(
      systemTableCache,
      JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED,
    );
    assertCritical(
      this.messageRouter,
      JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED,
    ); // Create SQL query engine with message router for transparent remote routing
    // The query engine will route queries to remote partitions via message router
    // System cache will be populated during phaseQuerySystemState()
    const sqlQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: this.messageRouter,
      nodeId: this.nodeId,
      rebalanceCoordinator: this.rebalanceCoordinator,
      controlPlaneReadinessService:
        this.rebalanceCoordinator?.controlPlaneReadinessService || null,
      defaultRoutingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      migrationAutoWire: false,
      autoStartDistributedTransactionRecovery: false,
      unrefRetryDelayTimers: true,
    });
    sqlQueryEngine.seedBootstrapRoutingOverlayFromSnapshots(
      this.bootstrapResponse?.systemTableSnapshots || null,
    );
    wireMigrationWorkflowOwners({
      sqlCore: sqlQueryEngine,
      systemTableCache,
      transactionCoordinator: sqlQueryEngine.transactionCoordinator,
      logger: this.logger,
      now: () => Date.now(),
    });
    const cdcIntegrationService = CDCIntegrationSetup.createForNormal({
      nodeId: this.nodeId,
      sqlQueryEngine,
      systemTableCache,
      messageRouter: this.messageRouter,
      cacheMutationTarget,
      partitionServicesProvider: () => this.partitionServices,
    });
    sqlQueryEngine.setCDCIntegrationService(cdcIntegrationService);
    for (const messageGroup of this.messageGroupServices.values()) {
      if (messageGroup.setCdcIntegrationService) {
        messageGroup.setCdcIntegrationService(cdcIntegrationService);
      }
    }
    this.cdcIntegrationService = cdcIntegrationService;
    this.logger.debug(
      NODE_JOINING_SERVICE_LITERAL.CDC_INTEGRATION_INITIALIZED_BY_OWNER,
      {
        nodeId: this.nodeId,
        owner: NODE_JOINING_SERVICE_LITERAL.CDCINTEGRATIONSETUP,
        mode: NODE_JOINING_SERVICE_LITERAL.NORMAL,
      },
    );
    return cdcIntegrationService;
  }
  /**
   * Ensure latency topology owners are initialized.
   * @return {Object}
   * @private
   */
  ensureLatencyTopologyOwners() {
    if (this.latencyTopology) {
      return this.latencyTopology;
    }
    this.latencyTopology = LatencyTopologySetup.create({
      nodeId: this.nodeId,
      systemTableCache: NodeService.getInstance().getSystemTableCache(),
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
    });
    this.latencyTopology.latencyTreeService.start({
      recomputeImmediately: true,
    });
    this.latencyTopology.cdcGroupPropagationService.start();
    this.logger.info(JOINING_LOG_MSG.LATENCY_TOPOLOGY_READY, {
      nodeId: this.nodeId,
      owner: NODE_JOINING_SERVICE_LITERAL.LATENCYTOPOLOGYSETUP,
    });
    return this.latencyTopology;
  }
  /**
   * Start latency topology lifecycle owners.
   * This is intentionally non-blocking relative to READY transition.
   * @private
   */
  startLatencyTopologyLifecycle() {
    return this.runtimeHandoffOwner.startLatencyTopologyLifecycle();
  }
  /**
   * Propagate partition CDC via topology-owned propagation path.
   * @param {Object} messageGroupService
   * @param {Object} cdcEvent
   * @return {Promise<Object>}
   * @private
   */
  async propagatePartitionCDCEvent(messageGroupService, cdcEvent) {
    const topologyOwners = assertCritical(
      this.latencyTopology,
      JOINING_ERROR_MSG.LATENCY_TOPOLOGY_MISSING,
    );
    return topologyOwners.cdcGroupPropagationService.propagateCDCEvent({
      tableName: cdcEvent.tableName,
      operation: cdcEvent.operation,
      data: cdcEvent.data,
      sourceMessageGroupService: messageGroupService,
    });
  }
}

export {NodeJoiningPublicationActivation};
