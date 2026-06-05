import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';

const {
  JOIN_DELEGATE_BUNDLE,
  NodeService,
  NodeStatePublicationOwner,
  TABLES,
  TYPEOF,
  resolveMembershipJoinIntentType,
} = NODE_JOINING_SERVICE_SHARED;

function createNodeJoiningRuntimeDependencyOwner({service, runtimeWiring}) {
  return {
    runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
    serviceRuntimeLifecycle: runtimeWiring.serviceRuntimeLifecycle,
    get logger() {
      return service.logger;
    },
    get transport() {
      return service.transport;
    },
    get messageRouter() {
      return service.messageRouter;
    },
    get rpcClient() {
      return service.rpcClient;
    },
    get cdcIntegrationService() {
      return service.cdcIntegrationService;
    },
    get systemTableCache() {
      return service.peekSystemTableCache();
    },
    get replicaHandler() {
      return service.replicaHandler;
    },
    get replicaStateMachine() {
      return service.replicaStateMachine;
    },
    get heartbeatService() {
      return service.heartbeatService;
    },
    get leaseService() {
      return service.leaseService;
    },
    get endpointService() {
      return service.endpointService;
    },
    get dispatchService() {
      return service.dispatchService;
    },
    get tablePolicyService() {
      return service.tablePolicyService;
    },
    getSqlQueryEngine() {
      return (
        service.sqlQueryEngine ||
        service.cdcIntegrationService?.sqlQueryEngine ||
        null
      );
    },
    get latencyTopology() {
      return service.latencyTopology;
    },
    get runtimeServiceHandler() {
      return service.runtimeServiceHandler;
    },
    get rebalanceCoordinator() {
      return service.rebalanceCoordinator;
    },
    get controlPlaneReadinessService() {
      return service.rebalanceCoordinator?.controlPlaneReadinessService || null;
    },
    get bootstrapReadinessState() {
      return service.joinReadinessState;
    },
    get serviceLifecycleManager() {
      return service.serviceLifecycleManager;
    },
    get serviceReconciler() {
      return service.serviceReconciler;
    },
  };
}

function defineNodeJoiningRuntimeDependencyProperties(service) {
  Object.defineProperties(service, {
    runtimeDriverRegistry: {
      configurable: true,
      enumerable: true,
      get: () => service.runtimeDependencyOwner.runtimeDriverRegistry,
    },
    serviceRuntimeLifecycle: {
      configurable: true,
      enumerable: true,
      get: () => service.runtimeDependencyOwner.serviceRuntimeLifecycle,
    },
  });
}

function installNodeJoiningStatePublicationOwner(service) {
  service.nodeStatePublicationOwner = new NodeStatePublicationOwner({
    nodeId: service.nodeId,
    nodeAddress: service.nodeAddress,
    config: service.config,
    delegates: {
      getNow: () => service.now(),
      getSleep: () => service.sleep,
      getLogger: () => service.logger,
      getNodeCapabilities: () => service.getNodeCapabilities(),
      getMessageRouter: () => service.messageRouter,
      getControlPlaneKernelIngress: () => service.controlPlaneKernelIngress,
      resolveLegacyTargetCandidates: (publicationOptions = {}) =>
        typeof service.resolveControlPlaneTargetAddressCandidates ===
        TYPEOF.FUNCTION ?
          service.resolveControlPlaneTargetAddressCandidates(
            publicationOptions,
          ) :
          [],
      resolveNodeStateUpdateTimeoutMs: (publicationOptions = {}) =>
        service.resolveControlPlaneNodeStateUpdateTimeoutMs(
          publicationOptions,
        ),
      shouldReconnectClusterMesh: () =>
        service.joinReadinessEvaluator?.shouldReconnectClusterMesh() === true,
      connectToClusterNodes: () => service.connectToClusterNodes(),
    },
  });
  Object.defineProperties(service, {
    controlPlaneTargetAddress: {
      configurable: true,
      enumerable: true,
      get: () => service.nodeStatePublicationOwner.controlPlaneTargetAddress,
      set: (value) => {
        service.nodeStatePublicationOwner.controlPlaneTargetAddress = value;
      },
    },
    pendingClusterMeshReconciliation: {
      configurable: true,
      enumerable: true,
      get: () =>
        service.nodeStatePublicationOwner.pendingClusterMeshReconciliation,
      set: (value) => {
        service.nodeStatePublicationOwner.pendingClusterMeshReconciliation =
          value;
      },
    },
    nodeStateUpdateDeferredPublication: {
      configurable: true,
      enumerable: true,
      get: () =>
        service.nodeStatePublicationOwner.nodeStateUpdateDeferredPublication,
      set: (value) => {
        service.nodeStatePublicationOwner.nodeStateUpdateDeferredPublication =
          value;
      },
    },
  });
  service.sendControlPlaneNodeStateUpdate = (publicationOptions = {}) =>
    service.nodeStatePublicationOwner.sendControlPlaneNodeStateUpdate(
      publicationOptions,
    );
  service.shouldRetryControlPlaneNodeStateUpdate = (
    error,
    publicationMode = null,
  ) =>
    service.nodeStatePublicationOwner.shouldRetryControlPlaneNodeStateUpdate(
      error,
      publicationMode,
    );
  service.resolveNodeStateUpdateTargetCandidates = (
    publicationOptions = {},
  ) =>
    service.nodeStatePublicationOwner.resolveNodeStateUpdateTargetCandidates(
      publicationOptions,
    );
  service.resolveNodeStateUpdatePublicationRetryClass = (error) =>
    service.nodeStatePublicationOwner.resolveNodeStateUpdatePublicationRetryClass(
      error,
    );
  service.shouldDeferNodeStateUpdatePublication = (
    error,
    publicationProfile = null,
  ) =>
    service.nodeStatePublicationOwner.shouldDeferNodeStateUpdatePublication(
      error,
      publicationProfile,
    );
  service.resolveNodeStateUpdatePublicationRetryAfterMs = (error) =>
    service.nodeStatePublicationOwner.resolveNodeStateUpdatePublicationRetryAfterMs(
      error,
    );
  service.clearDeferredNodeStateUpdatePublication = () =>
    service.nodeStatePublicationOwner.clearDeferredNodeStateUpdatePublication();
  service.buildDeferredNodeStateUpdatePublicationOutcome = (
    deferredPublication,
    nowMs,
  ) =>
    service.nodeStatePublicationOwner.buildDeferredNodeStateUpdatePublicationOutcome(
      deferredPublication,
      nowMs,
    );
  service.resolveDeferredNodeStateUpdatePublicationOutcome = (
    message,
    publicationMode,
    publicationProfile,
  ) =>
    service.nodeStatePublicationOwner.resolveDeferredNodeStateUpdatePublicationOutcome(
      message,
      publicationMode,
      publicationProfile,
    );
  service.deferNodeStateUpdatePublication = (publicationOptions = {}) =>
    service.nodeStatePublicationOwner.deferNodeStateUpdatePublication(
      publicationOptions,
    );
  service.triggerBackgroundClusterMeshReconciliation = (state) =>
    service.nodeStatePublicationOwner.triggerBackgroundClusterMeshReconciliation(
      state,
    );
}

function buildJoinDelegateBundles() {
  return {
    [JOIN_DELEGATE_BUNDLE.PHASE_EXECUTION]:
      this._buildJoinPhaseExecutionDelegates(),
    [JOIN_DELEGATE_BUNDLE.READINESS]: this._buildJoinReadinessDelegates(),
    [JOIN_DELEGATE_BUNDLE.CLEANUP]: this._buildJoinCleanupDelegates(),
    [JOIN_DELEGATE_BUNDLE.RUNTIME_WIRING]:
      this._buildJoinRuntimeWiringDelegates(),
  };
}

function composeJoinDelegates(bundles, options = {}) {
  if (options.cleanupOnly) {
    return {
      ...bundles[JOIN_DELEGATE_BUNDLE.CLEANUP],
      ...bundles[JOIN_DELEGATE_BUNDLE.READINESS],
    };
  }
  return {
    ...bundles[JOIN_DELEGATE_BUNDLE.PHASE_EXECUTION],
    ...bundles[JOIN_DELEGATE_BUNDLE.READINESS],
    ...bundles[JOIN_DELEGATE_BUNDLE.CLEANUP],
    ...bundles[JOIN_DELEGATE_BUNDLE.RUNTIME_WIRING],
  };
}

function buildJoinPhaseExecutionDelegates() {
  const self = this;
  return {
    getNodeId: () => self.nodeId,
    getNodeAddress: () => self.nodeAddress,
    getAdvertisedNodeWsAddress: () => self.advertisedNodeWsAddress,
    getWsPort: () => self.wsPort ?? self.config.wsPort,
    getConfig: () => self.config,
    getLogger: () => self.logger,
    getNow: () => self.now,
    getSleep: () => self.sleep,
    getRandom: () => self.random,
    getPhase: () => self.phase,
    getStartTime: () => self.startTime,
    getHttpPostImpl: () => self.httpPostImpl,
    getMessageRouter: () => self.messageRouter,
    getTransport: () => self.transport,
    getMessageGroupServices: () => self.messageGroupServices,
    getPartitionServices: () => self.partitionServices,
    getJoinMessageGroupReplicas: () => self.joinMessageGroupReplicas,
    getBootstrapResponse: () => self.bootstrapResponse,
    setBootstrapResponse: (v) => {
      self.bootstrapResponse = v;
    },
    getSeedNodeAddress: () => self.seedNodeAddress,
    getSeedNodeId: () => self.seedNodeId,
    setSeedNodeId: (v) => {
      self.seedNodeId = v;
    },
    getSeedNodeWsAddress: () => self.seedNodeWsAddress,
    setSeedNodeWsAddress: (v) => {
      self.seedNodeWsAddress = v;
    },
    setMessageRouter: (v) => {
      self.messageRouter = v;
    },
    setTransport: (v) => {
      self.transport = v;
    },
    pushJoinMessageGroupReplica: (replica) => {
      self.joinMessageGroupReplicas.push(replica);
    },
    removeJoinMessageGroupReplica: (replica) => {
      self.joinMessageGroupReplicas = self.joinMessageGroupReplicas.filter(
        (s) => s !== replica,
      );
    },
    resetJoinMessageGroupReplicas: () => {
      self.joinMessageGroupReplicas = [];
    },
    resolveJoinReplicaOptions: (id, type) =>
      self.resolveJoinReplicaOptions(id, type),
    assertReplicaStartupOwnership: (id) =>
      self.assertReplicaStartupOwnership(id),
    queueJoinServiceReplica: (desc, opts) =>
      self.queueJoinServiceReplica(desc, opts),
    createJoinServiceDescriptor: (type, id) =>
      self.createJoinServiceDescriptor(type, id),
    triggerJoinReconciler: (reason) => self.triggerJoinReconciler(reason),
    resolveJoinRetryPolicy: () => self.resolveJoinRetryPolicy(),
    classifySeedContactFailure: (err, msg) =>
      self.classifySeedContactFailure(err, msg),
    computeSeedContactRetryDelayMs: (opts) =>
      self.computeSeedContactRetryDelayMs(opts),
    upsertSystemTableRow: (table, data) =>
      self.upsertSystemTableRow(table, data),
    registerMessageGroupService: (gId, rId, svc, opts) =>
      self.registerMessageGroupService(gId, rId, svc, opts),
    getIdentifyPayload: () => self.getIdentifyBootstrapPayload(),
    getNodeCapabilities: () => self.getNodeCapabilities(),
    getLeaderMessageGroupService: () => self.getLeaderMessageGroupService(),
    initializeJoiningLifecycleOwners: () =>
      self.initializeJoiningLifecycleOwners(),
    ensureBootstrapSnapshotHydrated: async () => {
      if (self.systemCacheHydrated) {
        return;
      }
      await self.hydrateSystemCacheFromBootstrap();
      self.systemCacheHydrated = true;
    },
    sendControlPlaneNodeStateUpdate: (opts) =>
      self.sendControlPlaneNodeStateUpdate(opts),
    shouldRetryControlPlaneNodeStateUpdate: (error) =>
      self.shouldRetryControlPlaneNodeStateUpdate(error),
    resolveMeshConnectivityNodeRows: () =>
      self.joinReadinessEvaluator.resolveMeshConnectivityNodeRows(),
    buildClusterMeshSignature: (rows) =>
      self.joinReadinessEvaluator.buildClusterMeshSignature(rows),
    setLastClusterMeshSignature: (sig) => {
      self.joinReadinessEvaluator.lastClusterMeshSignature = sig;
    },
    hasMessageGroupLeaderInCache: (cache) =>
      self.hasMessageGroupLeaderInCache(cache),
    getMessageGroupServicesSize: () => self.messageGroupServices.size,
    emit: (event, data) => self.emit(event, data),
  };
}

function peekSystemTableCache() {
  for (const messageGroupService of this.messageGroupServices.values()) {
    if (typeof messageGroupService?.getReadOnlyCache === TYPEOF.FUNCTION) {
      const readOnlyCache = messageGroupService.getReadOnlyCache();
      if (readOnlyCache) {
        return readOnlyCache;
      }
    }
    if (messageGroupService?.systemTableCache) {
      return messageGroupService.systemTableCache;
    }
  }
  const nodeService = NodeService.getInstance();
  return nodeService?._readOnlyCache || nodeService?._systemTableCache || null;
}

function buildJoinReadinessDelegates() {
  const self = this;
  return {
    getLifecycleStateMachine: () => self.lifecycleStateMachine,
    getBootstrapReadinessState: () => self.bootstrapReadinessState,
  };
}

function buildJoinCleanupDelegates() {
  const self = this;
  return {
    getNodeId: () => self.nodeId,
    getLogger: () => self.logger,
    getNow: () => self.now,
    getPhase: () => self.phase,
    getStartTime: () => self.startTime,
    getMessageGroupServices: () => self.messageGroupServices,
    getPartitionServices: () => self.partitionServices,
    getMessageRouter: () => self.messageRouter,
    getTransport: () => self.transport,
    getBootstrapResponse: () => self.bootstrapResponse,
    setPhase: (p) => {
      self.phase = p;
    },
    setLastError: (e) => {
      self.lastError = e;
    },
    getLastError: () => self.lastError,
    setTransport: (v) => {
      self.transport = v;
    },
    setMessageRouter: (v) => {
      self.messageRouter = v;
    },
    getRegisteredJoinNodeId: () => {
      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const nodeRow = systemTableCache?.get?.(TABLES.NODES, self.nodeId);
      return nodeRow ? self.nodeId : null;
    },
    getJoinLifecycleIntentType: () =>
      resolveMembershipJoinIntentType(self.startupMode),
    getCdcIntegrationService: () => self.cdcIntegrationService,
    setCdcIntegrationService: (v) => {
      self.cdcIntegrationService = v;
    },
    getRebalanceCoordinator: () => self.rebalanceCoordinator,
    setRebalanceCoordinator: (v) => {
      self.rebalanceCoordinator = v;
    },
    getLatencyTopology: () => self.latencyTopology,
    setLatencyTopology: (v) => {
      self.latencyTopology = v;
    },
    getReplicaStateMachine: () => self.replicaStateMachine,
    setReplicaStateMachine: (v) => {
      self.replicaStateMachine = v;
    },
    getRpcClient: () => self.rpcClient,
    setRpcClient: (v) => {
      self.rpcClient = v;
    },
    getHeartbeatService: () => self.heartbeatService,
    setHeartbeatService: (v) => {
      self.heartbeatService = v;
    },
    getLeaseService: () => self.leaseService,
    setLeaseService: (v) => {
      self.leaseService = v;
    },
    getEndpointService: () => self.endpointService,
    setEndpointService: (v) => {
      self.endpointService = v;
    },
    getDispatchService: () => self.dispatchService,
    setDispatchService: (v) => {
      self.dispatchService = v;
    },
    getReplicaHandler: () => self.replicaHandler,
    setReplicaHandler: (v) => {
      self.replicaHandler = v;
    },
    sendControlPlaneNodeStateUpdate: (options) =>
      self.sendControlPlaneNodeStateUpdate(options),
    withdrawFailedJoinAdmission: (options) => {
      const owner = self.querySystemStatePhase?.nodeRegistrationOwner;
      if (typeof owner?.withdrawFailedJoinAdmission !== 'function') {
        throw new Error('NodeRegistrationOwner withdrawal delegate unavailable');
      }
      return owner.withdrawFailedJoinAdmission(options);
    },
    stopJoiningLifecycleOwners: () => self.stopJoiningLifecycleOwners(),
    emit: (event, data) => self.emit(event, data),
  };
}

function installNodeJoiningServiceSegment1DelegateMethods(ServiceClass) {
  Object.assign(ServiceClass.prototype, {
    _buildJoinDelegateBundles: buildJoinDelegateBundles,
    _composeJoinDelegates: composeJoinDelegates,
    _buildJoinPhaseExecutionDelegates: buildJoinPhaseExecutionDelegates,
    peekSystemTableCache,
    _buildJoinReadinessDelegates: buildJoinReadinessDelegates,
    _buildJoinCleanupDelegates: buildJoinCleanupDelegates,
  });
}

export {
  createNodeJoiningRuntimeDependencyOwner,
  defineNodeJoiningRuntimeDependencyProperties,
  installNodeJoiningServiceSegment1DelegateMethods,
  installNodeJoiningStatePublicationOwner,
};
