import {
  BOOTSTRAP_DEFAULT,
  SEED_DELEGATE_BUNDLE,
} from './bootstrap-constants.js';
import {
  INITIAL_MESSAGE_GROUP_ID,
} from './system-table-schemas-constants.js';

function createBootstrapServiceSeedDelegateMethods() {
  return {
    _buildSeedDelegateBundles() {
      return buildSeedDelegateBundles(this);
    },

    _composeSeedDelegates(bundles, options = {}) {
      return composeSeedDelegates(bundles, options);
    },

    _buildPhaseExecutionDelegates() {
      return buildPhaseExecutionDelegates(this);
    },

    _buildReadinessDelegates() {
      return buildReadinessDelegates(this);
    },

    _buildCleanupDelegates() {
      return buildCleanupDelegates(this);
    },

    _buildRuntimeWiringDelegates() {
      return buildRuntimeWiringDelegates(this);
    },
  };
}

function buildSeedDelegateBundles(service) {
  return {
    [SEED_DELEGATE_BUNDLE.PHASE_EXECUTION]:
      service._buildPhaseExecutionDelegates(),
    [SEED_DELEGATE_BUNDLE.READINESS]:
      service._buildReadinessDelegates(),
    [SEED_DELEGATE_BUNDLE.CLEANUP]:
      service._buildCleanupDelegates(),
    [SEED_DELEGATE_BUNDLE.RUNTIME_WIRING]:
      service._buildRuntimeWiringDelegates(),
  };
}

function composeSeedDelegates(bundles, options = {}) {
  if (options.cleanupOnly) {
    return {
      ...bundles[SEED_DELEGATE_BUNDLE.CLEANUP],
      ...bundles[SEED_DELEGATE_BUNDLE.READINESS],
    };
  }
  return {
    ...bundles[SEED_DELEGATE_BUNDLE.PHASE_EXECUTION],
    ...bundles[SEED_DELEGATE_BUNDLE.READINESS],
    ...bundles[SEED_DELEGATE_BUNDLE.CLEANUP],
    ...bundles[SEED_DELEGATE_BUNDLE.RUNTIME_WIRING],
  };
}

function buildPhaseExecutionDelegates(service) {
  const self = service;
  return {
    getNodeId: () => self.nodeId,
    getNodeAddress: () => self.nodeAddress,
    getAdvertisedNodeWsAddress: () =>
      self.advertisedNodeWsAddress,
    getWsPort: () => self.wsPort,
    getConfig: () => self.config,
    getLogger: () => self.logger,
    getPhase: () => self.phase,
    getStartTime: () => self.startTime,
    getServicesCreated: () => self.servicesCreated,
    getPartitionsCreated: () => self.partitionsCreated,
    getMessageGroupsCreated: () => self.messageGroupsCreated,

    getMessageRouter: () => self.messageRouter,
    getTransport: () => self.transport,
    getMessageGroupServices: () => self.messageGroupServices,
    getPartitionServices: () => self.partitionServices,
    getMessageGroupReplicas: () => self.messageGroupReplicas,
    getPartitionReplicas: () => self.partitionReplicas,

    getServiceLifecycleManager: () =>
      self.serviceLifecycleManager,
    getServiceReconciler: () => self.serviceReconciler,
    getServiceRuntimeLifecycle: () =>
      self.serviceRuntimeLifecycle,
    getBootstrapDesiredServiceDefinitions: () =>
      self.bootstrapDesiredServiceDefinitions,
    getBootstrapReplicaOptionsByServiceId: () =>
      self.bootstrapReplicaOptionsByServiceId,

    getLeaderMessageGroupService: (options) =>
      self.getLeaderMessageGroupService(options),
    getBootstrapMessageGroupService: () =>
      self.getBootstrapMessageGroupService(),
    resolveQueryTransportMessageGroupSelection: () =>
      self.resolveQueryTransportMessageGroupSelection(),
    resolveOperationalMessageGroupSelection: (options) =>
      self.resolveOperationalMessageGroupSelection(options),
    resolveOperationalMessageGroupSelectionAsync: (options) =>
      self.resolveOperationalMessageGroupSelectionAsync(options),
    buildMessageGroupOwnerNotReadyError: (selection, options) =>
      self.buildMessageGroupOwnerNotReadyError(selection, options),

    getSystemTableCache: () => self.getSystemTableCache(),
    getSystemTableCacheRef: () => self.systemTableCache,
    getCdcIntegrationService: () =>
      self.cdcIntegrationService,
    getEpochManager: () => self.epochManager,
    getRebalanceCoordinator: () =>
      self.rebalanceCoordinator,
    getLatencyTopology: () => self.latencyTopology,
    getSystemTableWriter: () => self.systemTableWriter,
    getTablePolicyService: () => self.tablePolicyService,
    getSqlQueryEngine: () =>
      self.sqlQueryEngine ||
      self.cdcIntegrationService?.sqlQueryEngine ||
      null,
    getBootstrapReadinessState: () =>
      self.bootstrapReadinessState,
    getPartitionReplicaProgressReporter: () =>
      self.partitionReplicaProgressReporter,
    getInitialMessageGroupId: () =>
      INITIAL_MESSAGE_GROUP_ID,

    setNodeId: (v) => {
      self.nodeId = v;
    },
    setNodeAddress: (v) => {
      self.nodeAddress = v;
    },
    setAdvertisedNodeWsAddress: (v) => {
      self.advertisedNodeWsAddress = v;
    },
    setMessageRouter: (v) => {
      self.messageRouter = v;
    },
    setTransport: (v) => {
      self.transport = v;
    },
    setServiceLifecycleManager: (v) => {
      self.serviceLifecycleManager = v;
    },
    setServiceReconciler: (v) => {
      self.serviceReconciler = v;
    },
    setPhase: (v) => {
      self.phase = v;
    },
    setPartitionsCreated: (v) => {
      self.partitionsCreated = v;
    },
    setEpochManager: (v) => {
      self.epochManager = v;
    },
    setSystemTableCacheRef: (v) => {
      self.systemTableCache = v;
    },
    setSystemTableWriter: (v) => {
      self.systemTableWriter = v;
    },
    setSqlQueryEngine: (v) => {
      self.sqlQueryEngine = v;
    },
    setCdcIntegrationService: (v) => {
      self.cdcIntegrationService = v;
    },
    setRpcClient: (v) => {
      self.rpcClient = v;
    },
    setTablePolicyService: (v) => {
      self.tablePolicyService = v;
    },
    setLatencyTopology: (v) => {
      self.latencyTopology = v;
    },
    incrementServicesCreated: () => {
      self.servicesCreated++;
    },
    incrementMessageGroupsCreated: () => {
      self.messageGroupsCreated++;
    },

    resetMessageGroupReplicas: () => {
      self.messageGroupReplicas = [];
    },
    pushMessageGroupReplica: (v) => {
      self.messageGroupReplicas.push(v);
    },
    filterMessageGroupReplicas: (exclude) => {
      self.messageGroupReplicas =
        self.messageGroupReplicas.filter(
          (s) => s !== exclude,
        );
    },
    resetPartitionReplicas: () => {
      self.partitionReplicas = [];
    },
    pushPartitionReplica: (v) => {
      self.partitionReplicas.push(v);
    },
    filterPartitionReplicas: (exclude) => {
      self.partitionReplicas =
        self.partitionReplicas.filter(
          (s) => s !== exclude,
        );
    },

    createBootstrapServiceDescriptor:
      (serviceType, serviceId) =>
        self.seedInfrastructurePhase
          .createBootstrapServiceDescriptor(
            serviceType, serviceId,
          ),
    queueBootstrapServiceReplica: (descriptor, options) =>
      self.seedInfrastructurePhase
        .queueBootstrapServiceReplica(
          descriptor, options,
        ),
    resolveBootstrapReplicaOptions:
      (serviceId, serviceType) =>
        self.seedInfrastructurePhase
          .resolveBootstrapReplicaOptions(
            serviceId, serviceType,
          ),
    triggerBootstrapReconciler: (reason) =>
      self.seedInfrastructurePhase
        .triggerBootstrapReconciler(reason),
    createBootstrapMessageGroupReplica: (context) =>
      self.seedMessageGroupsPhase
        .createBootstrapMessageGroupReplica(context),
    startBootstrapMessageGroupReplica: (handle, context) =>
      self.seedMessageGroupsPhase
        .startBootstrapMessageGroupReplica(
          handle, context,
        ),
    stopBootstrapMessageGroupReplica: (handle, context) =>
      self.seedMessageGroupsPhase
        .stopBootstrapMessageGroupReplica(
          handle, context,
        ),
    createBootstrapPartitionReplica: (context) =>
      self.seedPartitionsPhase
        .createBootstrapPartitionReplica(context),
    startBootstrapPartitionReplica: (handle, context) =>
      self.seedPartitionsPhase
        .startBootstrapPartitionReplica(
          handle, context,
        ),
    stopBootstrapPartitionReplica: (handle, context) =>
      self.seedPartitionsPhase
        .stopBootstrapPartitionReplica(
          handle, context,
        ),
    waitForMessageGroupLeadership: (groupId, replicaIds) =>
      self.seedMessageGroupsPhase
        .waitForMessageGroupLeadership(
          groupId, replicaIds,
        ),
    waitForPartitionLeadership: (options) =>
      self.seedPartitionsPhase
        .waitForPartitionLeadership(options),
    stopUnifiedLifecycleOwners: () =>
      self.seedInfrastructurePhase
        .stopUnifiedLifecycleOwners(),
    swapSystemTableWriter: () =>
      self.seedRegistrationPhase.swapSystemTableWriter(),
    ensureBootstrapCdcIntegrationService: () =>
      self.seedRuntimeBridgeOwner
        .ensureBootstrapCdcIntegrationService(),
    handleNodeReadyRebalanceTrigger: (cdcEvent, prevRow) =>
      self.nodeReadyRebalanceOwner.handleNodeReadyRebalanceTrigger(
        cdcEvent, prevRow,
      ),
    propagatePartitionCDCEvent: (mgs, cdcEvent) =>
      self.seedRuntimeBridgeOwner
        .propagatePartitionCDCEvent(mgs, cdcEvent),
    resolveCdcPropagationMessageGroup: (preferred) =>
      self.seedCacheHydrationPhase
        .resolveCdcPropagationMessageGroup(preferred),
    applyCurrentEpochFromCache: () =>
      self.seedRuntimeBridgeOwner
        .applyCurrentEpochFromCache(),
    hydrateFromLocalPartitions: (stc, mg) =>
      self.seedCacheHydrationPhase
        .hydrateFromLocalPartitions(stc, mg),
    createCdcPipelineReadinessGate: (stc) =>
      self.seedRuntimeBridgeOwner
        .createCdcPipelineReadinessGate(stc),
    emit: (event, data) => self.emit(event, data),
    sleep: (ms) => self.sleep(ms),

    resolvePartitionDbPath: (partitionId, replicaId) => {
      if (self.dataDirectoryManager &&
          self.dataDirectoryManager.isInitialized()) {
        return self.dataDirectoryManager
          .getPartitionDbPath(partitionId, replicaId);
      } else if (self.config.partitionDbPath) {
        return self.config.partitionDbPath;
      }
      return BOOTSTRAP_DEFAULT.partitionDbPath;
    },
  };
}

function buildReadinessDelegates(service) {
  const self = service;
  return {
    getLifecycleStateMachine: () =>
      self.lifecycleStateMachine,
    getBootstrapReadinessState: () =>
      self.bootstrapReadinessState,
  };
}

function buildCleanupDelegates(service) {
  const self = service;
  return {
    getNodeId: () => self.nodeId,
    getLogger: () => self.logger,
    getPhase: () => self.phase,
    getStartTime: () => self.startTime,
    getServicesCreated: () => self.servicesCreated,
    getMessageGroupsCreated: () => self.messageGroupsCreated,
    getInitialMessageGroupId: () =>
      INITIAL_MESSAGE_GROUP_ID,

    getMessageGroupServices: () => self.messageGroupServices,
    getPartitionServices: () => self.partitionServices,
    getMessageRouter: () => self.messageRouter,
    getTransport: () => self.transport,

    getSystemTableCacheRef: () => self.systemTableCache,
    getSystemTableCacheSafe: () =>
      self._getSystemTableCacheSafe(),
    getSystemTableWriter: () => self.systemTableWriter,
    getRebalanceCoordinator: () =>
      self.rebalanceCoordinator,
    getLatencyTopology: () => self.latencyTopology,

    setPhase: (v) => {
      self.phase = v;
    },
    setLastError: (v) => {
      self.lastError = v;
    },
    setIsShuttingDown: (v) => {
      self.isShuttingDown = v;
    },
    setMessageRouter: (v) => {
      self.messageRouter = v;
    },
    setTransport: (v) => {
      self.transport = v;
    },
    setSystemTableCacheRef: (v) => {
      self.systemTableCache = v;
    },
    setSystemTableWriter: (v) => {
      self.systemTableWriter = v;
    },
    setLatencyTopology: (v) => {
      self.latencyTopology = v;
    },

    resetMessageGroupReplicas: () => {
      self.messageGroupReplicas = [];
    },
    resetPartitionReplicas: () => {
      self.partitionReplicas = [];
    },

    stopUnifiedLifecycleOwners: () =>
      self.seedInfrastructurePhase
        .stopUnifiedLifecycleOwners(),
    emit: (event, data) => self.emit(event, data),

    clearCdcIntegrationService: () => {
      self.cdcIntegrationService = null;
    },
    stopAndClearControlPlaneServices: () => {
      // Stop the always-on owner-driven membership reconcile interval. It is
      // started unconditionally at control-plane setup and otherwise never
      // stopped, so each 5s tick keeps arming a ref'd 15s reconcile-timeout
      // timer that holds the event loop open long after teardown (the dominant
      // post-teardown hang across the integration suite). The coordinator is
      // shared; reach it via heartbeat or the rebalance coordinator readiness.
      const membershipPublicationService =
        self.heartbeatService?.membershipPublicationService ||
        self.rebalanceCoordinator?.controlPlaneReadinessService
          ?.membershipPublicationService ||
        null;
      if (membershipPublicationService &&
        typeof membershipPublicationService.stopOwnerMembershipDriver ===
          'function') {
        membershipPublicationService.stopOwnerMembershipDriver();
      }
      if (self.heartbeatService) {
        self.heartbeatService.stop();
        self.heartbeatService = null;
      }
      if (self.leaseService) {
        self.leaseService.stop();
        self.leaseService = null;
      }
      if (self.endpointService) {
        self.endpointService.stop();
        self.endpointService = null;
      }
      if (self.dispatchService) {
        self.dispatchService.stop();
        self.dispatchService = null;
      }
    },
    clearRpcClient: async () => {
      if (self.rpcClient) {
        await self.rpcClient.shutdown();
        self.rpcClient = null;
      }
    },
    clearRuntimeServiceHandler: async () => {
      if (self.runtimeServiceHandler) {
        self.runtimeServiceHandler.unregisterFromRouter(
          self.messageRouter,
        );
        await self.runtimeServiceHandler.shutdown();
        self.runtimeServiceHandler = null;
      }
    },
    clearReplicaStateMachine: () => {
      if (self.replicaStateMachine) {
        self.replicaStateMachine.stopTimeoutChecker();
        self.replicaStateMachine.clear();
        self.replicaStateMachine = null;
      }
    },
    clearEpochManager: () => {
      self.epochManager = null;
    },
    clearReplicaHandler: async () => {
      if (self.replicaHandler) {
        self.replicaHandler.unregisterFromRouter(
          self.messageRouter,
        );
        await self.replicaHandler.shutdown();
        self.replicaHandler = null;
      }
    },
    clearTablePolicyService: () => {
      self.tablePolicyService = null;
    },
    clearRebalanceCoordinator: () => {
      self.rebalanceCoordinator = null;
    },
    clearNodeReadyRebalanceState: () => {
      self.nodeReadyRebalanceOwner.clearNodeReadyRebalanceState();
    },
  };
}

function buildRuntimeWiringDelegates(service) {
  const self = service;
  return {
    getSystemTableCache: () => self.getSystemTableCache(),
    getMessageRouter: () => self.messageRouter,
    getRebalanceCoordinator: () =>
      self.rebalanceCoordinator,
    getCdcIntegrationService: () =>
      self.cdcIntegrationService,
    getEpochManager: () => self.epochManager,
  };
}

export {createBootstrapServiceSeedDelegateMethods};
