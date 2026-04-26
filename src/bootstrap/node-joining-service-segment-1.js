import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';

const {
  BOOTSTRAP_SUBSYSTEM,
  BootstrapMessageGroupSelectionOwner,
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  ConnectWebSocketPhase,
  ContactSeedPhase,
  ControlPlaneKernelIngress,
  CreateMessageGroupPhase,
  EventEmitter,
  HEARTBEAT_STATE,
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  JOINING_UNIFIED_RECONCILE,
  JOIN_DELEGATE_BUNDLE,
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
  JoinCleanupHandler,
  JoinCoordinator,
  JoinMessageGroupRuntimeOwner,
  JoinReadinessEvaluator,
  JoinSessionStore,
  JoiningPhase,
  LEASE_STATE,
  LatencyTopologySetup,
  LoggingService,
  MembershipLifecycleController,
  NODE_JOINING_SERVICE_LITERAL,
  NUM,
  NodeLifecycleStateMachine,
  NodeService,
  NodeState,
  NodeStatePublicationOwner,
  QuerySystemStatePhase,
  STARTUP_JOIN_MODE,
  STORAGE_DEFAULT,
  StartupRuntimeHandoffOwner,
  StartupRuntimeSurfaceOwner,
  StartupServiceLifecycleOwner,
  TABLES,
  TYPEOF,
  TablePolicyService,
  WaitForLeadershipPhase,
  WorkClassScheduler,
  _deriveWsAddressFromNodeAddress,
  _formatLeaderMetadataDetails,
  _parseBootstrapError,
  _resolveSeedContactRetryAfterMs,
  assertCritical,
  assertRequiredControlPlaneRollout,
  createJoiningPhaseOwners,
  createRuntimeStartupWiring,
  resolveMembershipJoinIntentType,
  uuidv4,
} = NODE_JOINING_SERVICE_SHARED;

class NodeJoiningServiceSegment1 extends EventEmitter {
  constructor(options = {}) {
    super();
    const explicitDataDirProvided = Object.prototype.hasOwnProperty.call(
      options,
      'dataDir',
    );
    this.rolloutControls = assertRequiredControlPlaneRollout({
      owner: NODE_JOINING_SERVICE_LITERAL.NODEJOININGSERVICE,
      controls: options.rolloutControls,
      required: CONTROL_PLANE_ROLLOUT_REQUIRED.NODE_JOINING_SERVICE,
    });
    this.nodeId = options.nodeId || uuidv4();
    this.nodeAddress = options.nodeAddress || null;
    this.advertisedNodeWsAddress = options.advertisedNodeWsAddress || null;
    this.seedNodeAddress = options.seedNodeAddress || null;
    this.seedNodeWsAddress = options.seedNodeWsAddress || null;
    this.seedNodeId = null; // Allow explicit 0 to mean "do not start a WebSocket server" (useful in tests/sandboxes).
    this.wsPort = options.wsPort ?? null;
    this.dataDir = options.dataDir || STORAGE_DEFAULT.DATA_DIR;
    this.config = {...JOINING_DEFAULT, ...options.config};
    this.config.replicaStaggerDelayMs = Number.isFinite(
      this.config.replicaStaggerDelayMs,
    ) ?
      Math.max(NUM.ZERO, this.config.replicaStaggerDelayMs) :
      JOINING_DEFAULT.replicaStaggerDelayMs;
    this.config.heartbeatIntervalMs = Number.isFinite(
      this.config.heartbeatIntervalMs,
    ) ?
      Math.max(NUM.HUNDRED, this.config.heartbeatIntervalMs) :
      JOINING_DEFAULT.heartbeatIntervalMs;
    this.config.leadershipWaitJitterRatio = Number.isFinite(
      this.config.leadershipWaitJitterRatio,
    ) ?
      Math.min(
        NUM.ONE,
        Math.max(NUM.ZERO, this.config.leadershipWaitJitterRatio),
      ) :
      JOINING_DEFAULT.leadershipWaitJitterRatio;
    this.workClassScheduler =
      options.workClassScheduler || new WorkClassScheduler();
    this.random =
      typeof options.random === TYPEOF.FUNCTION ? options.random : Math.random;
    this.now =
      typeof options.now === TYPEOF.FUNCTION ? options.now : () => Date.now();
    this.sleep =
      typeof options.sleep === TYPEOF.FUNCTION ?
        options.sleep :
        (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
    this.joinSessionIdProvided =
      typeof options.joinSessionId === TYPEOF.STRING &&
      options.joinSessionId.length > NUM.ZERO;
    this.joinSessionId = this.joinSessionIdProvided ?
      options.joinSessionId :
      uuidv4();
    const defaultJoinSessionStore =
      options.joinSessionStore instanceof JoinSessionStore ?
        options.joinSessionStore :
        new JoinSessionStore({
          now: this.now,
          dataDir: explicitDataDirProvided ? this.dataDir : null,
        });
    this.joinCoordinator =
      options.joinCoordinator instanceof JoinCoordinator ?
        options.joinCoordinator :
        new JoinCoordinator({joinSessionStore: defaultJoinSessionStore});
    this.onLocalAdminRuntimeReady =
      typeof options.onLocalAdminRuntimeReady === TYPEOF.FUNCTION ?
        options.onLocalAdminRuntimeReady :
        null;
    this.localAdminRuntimeReadyNotified = false;
    this.joinSessionStore = this.joinCoordinator.joinSessionStore;
    this.joinReadinessSnapshotProvider =
      typeof options.joinReadinessSnapshotProvider === TYPEOF.FUNCTION ?
        options.joinReadinessSnapshotProvider :
        null;
    this.bootstrapReadinessState = options.readinessState || null;
    this.startupMode =
      typeof options.startupMode === TYPEOF.STRING &&
      options.startupMode.length > NUM.ZERO ?
        options.startupMode :
        STARTUP_JOIN_MODE.FRESH_JOIN;
    this.clusterIncarnationFence =
      options.clusterIncarnationFence &&
      typeof options.clusterIncarnationFence === TYPEOF.OBJECT ?
        options.clusterIncarnationFence :
        null;
    this.membershipLifecycleController =
      options.membershipLifecycleController &&
      typeof options.membershipLifecycleController.submitJoinIntent ===
        TYPEOF.FUNCTION ?
        options.membershipLifecycleController :
        new MembershipLifecycleController({
          nodeId: this.nodeId,
          startupMode: this.startupMode,
          now: this.now,
        }); // Allow tests to bypass real network I/O by providing an in-process HTTP POST.
    this.httpPostImpl =
      typeof options.httpPost === TYPEOF.FUNCTION ?
        options.httpPost :
        this.httpPost.bind(this); // Services created during joining
    this.messageGroupServices = new Map();
    this.messageGroupSelectionOwner = new BootstrapMessageGroupSelectionOwner({
      delegates: {getMessageGroupServices: () => this.messageGroupServices},
    });
    this.partitionServices = new Map();
    this.transport = null; // MessageRouter for unified local/remote message routing
    this.messageRouter = null; // Unified lifecycle desired-state descriptors for join-created services.
    this.joinDesiredServiceDefinitions = new Map(); // Join replica creation options keyed by canonical serviceId.
    this.joinReplicaOptionsByServiceId = new Map(); // Track message-group replicas created for deferred election start.
    this.joinMessageGroupReplicas = [];
    this.inFlightBackfillsByKey = new Map(); // Unified lifecycle owners for joining message-group startup.
    this.serviceLifecycleManager = null;
    this.serviceReconciler = null; // Replica handler for CREATE_REPLICA/REMOVE_REPLICA execution
    this.replicaHandler = null; // Replica state machine for tracking replica lifecycle states
    this.replicaStateMachine = null; // Decomposed control plane services
    this.heartbeatService = null;
    this.leaseService = null;
    this.endpointService = null;
    this.dispatchService = null;
    this.rebalanceCoordinator = null; // Unified runtime ownership wiring.
    const runtimeWiring = createRuntimeStartupWiring({
      ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled),
    });
    const self = this;
    this.runtimeDependencyOwner = {
      runtimeDriverRegistry: runtimeWiring.runtimeDriverRegistry,
      serviceRuntimeLifecycle: runtimeWiring.serviceRuntimeLifecycle,
      get logger() {
        return self.logger;
      },
      get transport() {
        return self.transport;
      },
      get messageRouter() {
        return self.messageRouter;
      },
      get rpcClient() {
        return self.rpcClient;
      },
      get cdcIntegrationService() {
        return self.cdcIntegrationService;
      },
      get systemTableCache() {
        return self.peekSystemTableCache();
      },
      get replicaHandler() {
        return self.replicaHandler;
      },
      get replicaStateMachine() {
        return self.replicaStateMachine;
      },
      get heartbeatService() {
        return self.heartbeatService;
      },
      get leaseService() {
        return self.leaseService;
      },
      get endpointService() {
        return self.endpointService;
      },
      get dispatchService() {
        return self.dispatchService;
      },
      get tablePolicyService() {
        return self.tablePolicyService;
      },
      getSqlQueryEngine() {
        return (
          self.sqlQueryEngine ||
          self.cdcIntegrationService?.sqlQueryEngine ||
          null
        );
      },
      get latencyTopology() {
        return self.latencyTopology;
      },
      get runtimeServiceHandler() {
        return self.runtimeServiceHandler;
      },
      get rebalanceCoordinator() {
        return self.rebalanceCoordinator;
      },
      get controlPlaneReadinessService() {
        return self.rebalanceCoordinator?.controlPlaneReadinessService || null;
      },
      get bootstrapReadinessState() {
        return self.joinReadinessState;
      },
      get serviceLifecycleManager() {
        return self.serviceLifecycleManager;
      },
      get serviceReconciler() {
        return self.serviceReconciler;
      },
    };
    Object.defineProperties(this, {
      runtimeDriverRegistry: {
        configurable: true,
        enumerable: true,
        get: () => this.runtimeDependencyOwner.runtimeDriverRegistry,
      },
      serviceRuntimeLifecycle: {
        configurable: true,
        enumerable: true,
        get: () => this.runtimeDependencyOwner.serviceRuntimeLifecycle,
      },
    });
    this.runtimeDrivers = runtimeWiring.drivers; // RPC client for control plane dispatch
    this.rpcClient = null; // CDC integration service for system table writes
    this.cdcIntegrationService = null; // Storage budget owner for node registration
    this.nodeStorageBudgetService = null; // Table policy service for partition placement decisions
    this.tablePolicyService = null;
    this.latencyTopology = null; // Track system cache hydration state for rebalancer initialization
    this.systemCacheHydrated = false;
    this.bootstrapTopologySnapshotMeta = null;
    this.bootstrapTopologySnapshotHydratedAtMs = null;
    this.durableRejoinRestoreState =
      this.startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN ?
        JOIN_REJOIN_PROMOTION_RESTORE_STATE.PENDING :
        JOIN_REJOIN_PROMOTION_RESTORE_STATE.NOT_APPLICABLE; // Track CDC subscription status
    this.cdcSubscriptionsActive = false;
    this.messageGroupServiceHandler = null;
    this.controlPlaneKernelIngress =
      options.controlPlaneKernelIngress instanceof ControlPlaneKernelIngress ?
        options.controlPlaneKernelIngress :
        new ControlPlaneKernelIngress({
          nodeId: this.nodeId,
          getBootstrapResponse: () => this.bootstrapResponse,
          getSeedNodeId: () => this.seedNodeId,
          getMessageRouter: () => this.messageRouter,
          getMessageGroupServices: () => this.messageGroupServices,
          getSqlQueryEngine: () =>
            this.cdcIntegrationService?.sqlQueryEngine || null,
        });
    this.nodeStatePublicationOwner = new NodeStatePublicationOwner({
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      config: this.config,
      delegates: {
        getNow: () => this.now(),
        getSleep: () => this.sleep,
        getLogger: () => this.logger,
        getNodeCapabilities: () => this.getNodeCapabilities(),
        getMessageRouter: () => this.messageRouter,
        getControlPlaneKernelIngress: () => this.controlPlaneKernelIngress,
        resolveLegacyTargetCandidates: (publicationOptions = {}) =>
          typeof this.resolveControlPlaneTargetAddressCandidates ===
          TYPEOF.FUNCTION ?
            this.resolveControlPlaneTargetAddressCandidates(
              publicationOptions,
            ) :
            [],
        resolveNodeStateUpdateTimeoutMs: (publicationOptions = {}) =>
          this.resolveControlPlaneNodeStateUpdateTimeoutMs(publicationOptions),
        shouldReconnectClusterMesh: () =>
          this.joinReadinessEvaluator?.shouldReconnectClusterMesh() === true,
        connectToClusterNodes: () => this.connectToClusterNodes(),
      },
    });
    Object.defineProperties(this, {
      controlPlaneTargetAddress: {
        configurable: true,
        enumerable: true,
        get: () => this.nodeStatePublicationOwner.controlPlaneTargetAddress,
        set: (value) => {
          this.nodeStatePublicationOwner.controlPlaneTargetAddress = value;
        },
      },
      pendingClusterMeshReconciliation: {
        configurable: true,
        enumerable: true,
        get: () =>
          this.nodeStatePublicationOwner.pendingClusterMeshReconciliation,
        set: (value) => {
          this.nodeStatePublicationOwner.pendingClusterMeshReconciliation =
            value;
        },
      },
      nodeStateUpdateDeferredPublication: {
        configurable: true,
        enumerable: true,
        get: () =>
          this.nodeStatePublicationOwner.nodeStateUpdateDeferredPublication,
        set: (value) => {
          this.nodeStatePublicationOwner.nodeStateUpdateDeferredPublication =
            value;
        },
      },
    });
    this.sendControlPlaneNodeStateUpdate = (publicationOptions = {}) =>
      this.nodeStatePublicationOwner.sendControlPlaneNodeStateUpdate(
        publicationOptions,
      );
    this.shouldRetryControlPlaneNodeStateUpdate = (
      error,
      publicationMode = null,
    ) =>
      this.nodeStatePublicationOwner.shouldRetryControlPlaneNodeStateUpdate(
        error,
        publicationMode,
      );
    this.resolveNodeStateUpdateTargetCandidates = (publicationOptions = {}) =>
      this.nodeStatePublicationOwner.resolveNodeStateUpdateTargetCandidates(
        publicationOptions,
      );
    this.resolveNodeStateUpdatePublicationRetryClass = (error) =>
      this.nodeStatePublicationOwner.resolveNodeStateUpdatePublicationRetryClass(
        error,
      );
    this.shouldDeferNodeStateUpdatePublication = (
      error,
      publicationProfile = null,
    ) =>
      this.nodeStatePublicationOwner.shouldDeferNodeStateUpdatePublication(
        error,
        publicationProfile,
      );
    this.resolveNodeStateUpdatePublicationRetryAfterMs = (error) =>
      this.nodeStatePublicationOwner.resolveNodeStateUpdatePublicationRetryAfterMs(
        error,
      );
    this.clearDeferredNodeStateUpdatePublication = () =>
      this.nodeStatePublicationOwner.clearDeferredNodeStateUpdatePublication();
    this.buildDeferredNodeStateUpdatePublicationOutcome = (
      deferredPublication,
      nowMs,
    ) =>
      this.nodeStatePublicationOwner.buildDeferredNodeStateUpdatePublicationOutcome(
        deferredPublication,
        nowMs,
      );
    this.resolveDeferredNodeStateUpdatePublicationOutcome = (
      message,
      publicationMode,
      publicationProfile,
    ) =>
      this.nodeStatePublicationOwner.resolveDeferredNodeStateUpdatePublicationOutcome(
        message,
        publicationMode,
        publicationProfile,
      );
    this.deferNodeStateUpdatePublication = (publicationOptions = {}) =>
      this.nodeStatePublicationOwner.deferNodeStateUpdatePublication(
        publicationOptions,
      );
    this.triggerBackgroundClusterMeshReconciliation = (state) =>
      this.nodeStatePublicationOwner.triggerBackgroundClusterMeshReconciliation(
        state,
      ); // Node lifecycle state machine for explicit state transitions
    // Requirements: 2.1, 2.2, 2.3, 2.4
    this.lifecycleStateMachine = new NodeLifecycleStateMachine({
      nodeId: this.nodeId,
      initialState: NodeState.STARTING,
    }); // Bootstrap response from seed node
    this.bootstrapResponse = null; // Joining state
    this.seedContactStartupAuthority = null;
    this.phase = JoiningPhase.NOT_STARTED;
    this.startTime = null;
    this.phaseStartTime = null; // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.NODE_JOINING);
    this.logger.debug(JOINING_LOG_MSG.RUNTIME_WIRING_READY, {
      nodeId: this.nodeId,
      owner: NODE_JOINING_SERVICE_LITERAL.CREATERUNTIMESTARTUPWIRING,
      runtimeDriverCount: Object.keys(this.runtimeDrivers).length,
      ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled),
    });
    this.runtimeHandoffOwner = new StartupRuntimeHandoffOwner({
      delegates: {
        getCompatibilityService: () => this,
        getLeaseService: () => this.leaseService,
        getLeaseRunningState: () => LEASE_STATE.RUNNING,
        getHeartbeatService: () => this.heartbeatService,
        getHeartbeatRunningState: () => HEARTBEAT_STATE.RUNNING,
        beforeActivateControlPlaneBackgroundWriters: () => {
          this.disableSteadyStateControlPlaneReporter();
        },
        buildHeartbeatStartOptions: () =>
          this.buildControlPlaneHeartbeatStartOptions(),
        activateDistributedTransactionRecoveryOnWriterActivation: false,
        activateDistributedTransactionRecovery: () => {
          const sqlQueryEngine = this.cdcIntegrationService?.sqlQueryEngine;
          if (
            typeof sqlQueryEngine?.activateDistributedTransactionRecovery !==
            TYPEOF.FUNCTION
          ) {
            return;
          }
          void sqlQueryEngine.activateDistributedTransactionRecovery();
        },
        flushDeferredCreateSelfHostedMetadata: () => {
          if (
            typeof this.createMessageGroupPhase
              ?.flushDeferredCreateSelfHostedMetadata !== TYPEOF.FUNCTION
          ) {
            return;
          }
          void this.createMessageGroupPhase
            .flushDeferredCreateSelfHostedMetadata()
            .catch((error) => {
              this.logger.warn(
                NODE_JOINING_SERVICE_LITERAL.DEFERRED_CREATE_SELF_HOSTED_MESSAGE_GROUP_METADATA_PUBLICATION_FAILED,
                {nodeId: this.nodeId, error: error?.message || String(error)},
              );
            });
        },
        startLatencyTopologyLifecycle: () => {
          const topologyOwners = assertCritical(
            this.latencyTopology,
            JOINING_ERROR_MSG.LATENCY_TOPOLOGY_MISSING,
          );
          LatencyTopologySetup.start(topologyOwners);
          this.logger.info(JOINING_LOG_MSG.LATENCY_TOPOLOGY_STARTED, {
            nodeId: this.nodeId,
            owner: NODE_JOINING_SERVICE_LITERAL.LATENCYTOPOLOGYSETUP,
          });
        },
        onControlPlaneBackgroundWritersActivated: () => {
          this.logger.info(
            JOINING_LOG_MSG.CONTROL_PLANE_BACKGROUND_WRITERS_ACTIVE,
            {nodeId: this.nodeId},
          );
        },
      },
    });
    this.joiningPhaseOwners = createJoiningPhaseOwners(this); // Join readiness evaluator (extracted helper)
    this.joinReadinessEvaluator = new JoinReadinessEvaluator({
      nodeId: this.nodeId,
      now: this.now,
      sleep: this.sleep,
      delegates: {
        resolveControlPlaneTargetAddress: (opts) =>
          this.resolveControlPlaneTargetAddress(opts),
        resolveControlPlaneTargetAddressCandidates: (opts) =>
          this.resolveControlPlaneTargetAddressCandidates(opts),
        getMissingSystemServiceLeaders: (cache) =>
          this.waitForLeadershipPhase.getMissingSystemServiceLeaders(cache),
        getBlockingSystemServiceLeaders: (missing, cache) =>
          this.waitForLeadershipPhase.getBlockingSystemServiceLeaders(
            missing,
            cache,
          ),
        backfillPropagatedCacheTables: (tables, backfillOptions) =>
          this.backfillPropagatedCacheTablesFromAuthoritativeState(
            tables,
            backfillOptions,
          ),
        getMessageRouter: () => this.messageRouter,
        getBootstrapResponse: () => this.bootstrapResponse,
        getBootstrapTopologySnapshotMeta: () =>
          this.bootstrapTopologySnapshotMeta,
        getBootstrapTopologySnapshotActiveNodeIds: () => {
          const topologySnapshotMeta =
            this.bootstrapTopologySnapshotMeta ||
            this.bootstrapResponse?.topologySnapshotMeta ||
            null;
          return Array.isArray(topologySnapshotMeta?.activeNodeIds) ?
            topologySnapshotMeta.activeNodeIds :
            [];
        },
        getBootstrapTopologySnapshotEpoch: () => {
          const topologySnapshotMeta =
            this.bootstrapTopologySnapshotMeta ||
            this.bootstrapResponse?.topologySnapshotMeta ||
            null;
          if (Number.isFinite(topologySnapshotMeta?.topologyEpoch)) {
            return topologySnapshotMeta.topologyEpoch;
          }
          if (Number.isFinite(this.bootstrapResponse?.currentEpoch?.epoch)) {
            return this.bootstrapResponse.currentEpoch.epoch;
          }
          return null;
        },
        getBootstrapTopologySnapshotHydratedAtMs: () =>
          this.bootstrapTopologySnapshotHydratedAtMs,
        getSystemCacheHydrated: () => this.systemCacheHydrated,
        getJoinStartupMode: () => this.startupMode,
        getDurableRejoinRestoreState: () => this.durableRejoinRestoreState,
        getLifecycleState: () =>
          this.lifecycleStateMachine?.getState?.() || null,
        getControlPlaneReadinessService: () =>
          this.rebalanceCoordinator?.controlPlaneReadinessService || null,
        getJoinReadinessSnapshotProvider: () =>
          this.joinReadinessSnapshotProvider,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getLogger: () => this.logger,
        getConfig: () => this.config,
      },
    }); // Contact seed phase (extracted helper)
    this.contactSeedPhase = new ContactSeedPhase({
      nodeId: this.nodeId,
      delegates: {
        getSeedNodeAddress: () => this.seedNodeAddress,
        getNodeAddress: () => this.nodeAddress,
        getJoinStartupMode: () => this.startupMode,
        getLogger: () => this.logger,
        getConfig: () => this.config,
        getNow: () => this.now,
        getSleep: () => this.sleep,
        getRandom: () => this.random,
        getHttpPostImpl: () => this.httpPostImpl,
        getBootstrapResponse: () => this.bootstrapResponse,
        setBootstrapResponse: (v) => {
          this.bootstrapResponse = v;
        },
        setSeedContactStartupAuthority: (v) => {
          this.seedContactStartupAuthority = v || null;
        },
        getSeedNodeId: () => this.seedNodeId,
        setSeedNodeId: (v) => {
          this.seedNodeId = v;
        },
        getSeedNodeWsAddress: () => this.seedNodeWsAddress,
        setSeedNodeWsAddress: (v) => {
          this.seedNodeWsAddress = v;
        },
      },
    }); // Connect WebSocket phase (extracted helper)
    this.connectWebSocketPhase = new ConnectWebSocketPhase({
      nodeId: this.nodeId,
      delegates: {
        getWsPort: () => this.wsPort ?? this.config.wsPort,
        getNodeAddress: () => this.nodeAddress,
        getAdvertisedNodeWsAddress: () => this.advertisedNodeWsAddress,
        getLogger: () => this.logger,
        getIdentifyPayload: () => this.getIdentifyBootstrapPayload(),
        getNow: () => this.now,
        getSleep: () => this.sleep,
        resolveJoinRetryPolicy: () => this.resolveJoinRetryPolicy(),
        computeSeedContactRetryDelayMs: (opts) =>
          this.computeSeedContactRetryDelayMs(opts),
        getMessageRouter: () => this.messageRouter,
        setMessageRouter: (v) => {
          this.messageRouter = v;
        },
        setTransport: (v) => {
          this.transport = v;
        },
        getLeaderMessageGroupService: () => this.getLeaderMessageGroupService(),
        resolveQueryTransportMessageGroupSelection: () =>
          this.resolveQueryTransportMessageGroupSelection(),
        initializeJoiningLifecycleOwners: () =>
          this.initializeJoiningLifecycleOwners(),
        triggerJoinReconciler: (reason) => this.triggerJoinReconciler(reason),
        ensureBootstrapSnapshotHydrated: async () => {
          if (this.systemCacheHydrated) {
            return;
          }
          await this.hydrateSystemCacheFromBootstrap();
          this.systemCacheHydrated = true;
        },
        getSeedNodeWsAddress: () => this.seedNodeWsAddress,
        getSeedNodeId: () => this.seedNodeId,
        getBootstrapResponse: () => this.bootstrapResponse,
        getSystemTableCache: () =>
          NodeService.getInstance().getSystemTableCache(),
        sendControlPlaneNodeStateUpdate: (opts) =>
          this.sendControlPlaneNodeStateUpdate(opts),
        shouldRetryControlPlaneNodeStateUpdate: (error) =>
          this.shouldRetryControlPlaneNodeStateUpdate(error),
        getNodeCapabilities: () => this.getNodeCapabilities(),
        resolveMeshConnectivityNodeRows: () =>
          this.joinReadinessEvaluator.resolveMeshConnectivityNodeRows(),
        repairMeshConnectivityAuthorityIfNeeded: (missingNodeIds) =>
          this.joinReadinessEvaluator.repairMeshConnectivityAuthorityIfNeeded(
            missingNodeIds,
          ),
        buildClusterMeshSignature: (rows) =>
          this.joinReadinessEvaluator.buildClusterMeshSignature(rows),
        setLastClusterMeshSignature: (sig) => {
          this.joinReadinessEvaluator.lastClusterMeshSignature = sig;
        },
      },
    }); // Build concern-scoped delegate bundles for extracted phase modules.
    // Each bundle groups delegates by concern (D2.2) so owners receive
    // only the dependencies they need.
    this._joinDelegateBundles = this._buildJoinDelegateBundles(); // Join cleanup handler (extracted helper)
    // Uses cleanupOnly composition so it receives cleanup + readiness
    // delegates but not phase execution or runtime wiring (D2.2).
    this.joinCleanupHandler = new JoinCleanupHandler({
      nodeId: this.nodeId,
      delegates: this._composeJoinDelegates(this._joinDelegateBundles, {
        cleanupOnly: true,
      }),
    }); // Query system state phase (extracted helper)
    this.querySystemStatePhase = new QuerySystemStatePhase({
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      advertisedNodeWsAddress: this.advertisedNodeWsAddress,
      delegates: {
        getLogger: () => this.logger,
        getConfig: () => this.config,
        getNow: () => this.now,
        getSleep: () => this.sleep,
        getWsPort: () => this.wsPort ?? this.config.wsPort,
        getBootstrapResponse: () => this.bootstrapResponse,
        setBootstrapTopologySnapshotMeta: (value) => {
          this.bootstrapTopologySnapshotMeta =
            value && typeof value === TYPEOF.OBJECT ? value : null;
        },
        setBootstrapTopologySnapshotHydratedAtMs: (value) => {
          this.bootstrapTopologySnapshotHydratedAtMs = Number.isFinite(value) ?
            value :
            null;
        },
        getLifecycleStateMachine: () => this.lifecycleStateMachine,
        getSeedNodeId: () => this.seedNodeId,
        getMessageRouter: () => this.messageRouter,
        connectToClusterNodes: (options = {}) =>
          this.connectToClusterNodes(options),
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemCacheHydrated: () => this.systemCacheHydrated,
        setSystemCacheHydrated: (v) => {
          this.systemCacheHydrated = v;
        },
        getCdcSubscriptionsActive: () => this.cdcSubscriptionsActive,
        getPartitionServices: () => this.partitionServices,
        getMessageGroupServices: () => this.messageGroupServices,
        getNodeStorageBudgetService: () => this.getNodeStorageBudgetService(),
        getSystemTableCache: () =>
          NodeService.getInstance().getSystemTableCache(),
        ensureLatencyTopologyOwners: () => this.ensureLatencyTopologyOwners(),
        ensureTablePolicyService: (cache) => {
          if (!this.tablePolicyService) {
            this.tablePolicyService = new TablePolicyService({
              systemTableCache: cache,
              cdcIntegrationService: this.cdcIntegrationService,
            });
            this.tablePolicyService.initialize();
          }
        },
        restoreDurableRejoinLocalPartitionServices: (cache) =>
          this.restoreDurableRejoinLocalPartitionServices(cache),
        applySystemCacheToPartitions: (cache) => {
          for (const partition of this.partitionServices.values()) {
            partition.setSystemTableCache(cache);
            partition.setTablePolicyService(this.tablePolicyService);
          }
        },
        waitForSystemServiceLeaders: (cache) =>
          this.waitForLeadershipPhase.waitForSystemServiceLeaders(cache),
        registerCreateSelfHostedMetadata: () =>
          this.registerCreateSelfHostedMetadata(),
        registerNodeInCluster: () => this.registerNodeInCluster(),
        sendControlPlaneNodeStateUpdate: (options) =>
          this.sendControlPlaneNodeStateUpdate(options),
        getJoinLifecycleIntentType: () =>
          resolveMembershipJoinIntentType(this.startupMode),
        getJoinStartupMode: () => this.startupMode,
        getClusterIncarnationFence: () => this.clusterIncarnationFence,
        getDataDir: () => this.dataDir,
        getNodeCapabilities: () => this.getNodeCapabilities(),
        subscribeToCDCEvents: () => this.subscribeToCDCEvents(),
        createCdcPipelineReadinessGate: (cache) =>
          this.createCdcPipelineReadinessGate(cache),
        backfillPropagatedCacheTablesFromAuthoritativeState: (tableNames) =>
          this.backfillPropagatedCacheTablesFromAuthoritativeState(tableNames),
        triggerJoinReconciler: (reason) => this.triggerJoinReconciler(reason),
        stopJoiningLifecycleOwners: () => this.stopJoiningLifecycleOwners(),
      },
    }); // Wait for leadership phase (extracted helper)
    this.waitForLeadershipPhase = new WaitForLeadershipPhase({
      nodeId: this.nodeId,
      delegates: {
        getLogger: () => this.logger,
        getConfig: () => this.config,
        getNow: () => this.now,
        getSleep: () => this.sleep,
        getSystemTableCache: () =>
          NodeService.getInstance().getSystemTableCache(),
        getMessageGroupServicesSize: () => this.messageGroupServices.size,
        getMessageGroupServices: () => this.messageGroupServices,
        hasMessageGroupLeaderInCache: (cache) =>
          this.hasMessageGroupLeaderInCache(cache),
        getBootstrapResponse: () => this.bootstrapResponse,
      },
    }); // Create message group phase (extracted helper)
    this.createMessageGroupPhase = new CreateMessageGroupPhase({
      nodeId: this.nodeId,
      delegates: {
        getLogger: () => this.logger,
        getConfig: () => this.config,
        getNow: () => this.now,
        getSleep: () => this.sleep,
        getMessageRouter: () => this.messageRouter,
        getMessageGroupServices: () => this.messageGroupServices,
        getJoinMessageGroupReplicas: () => this.joinMessageGroupReplicas,
        pushJoinMessageGroupReplica: (replica) => {
          this.joinMessageGroupReplicas.push(replica);
        },
        removeJoinMessageGroupReplica: (replica) => {
          this.joinMessageGroupReplicas = this.joinMessageGroupReplicas.filter(
            (s) => s !== replica,
          );
        },
        resetJoinMessageGroupReplicas: () => {
          this.joinMessageGroupReplicas = [];
        },
        resolveJoinReplicaOptions: (id, type) =>
          this.resolveJoinReplicaOptions(id, type),
        assertReplicaStartupOwnership: (id) =>
          this.assertReplicaStartupOwnership(id),
        queueJoinServiceReplica: (desc, opts) =>
          this.queueJoinServiceReplica(desc, opts),
        createJoinServiceDescriptor: (type, id) =>
          this.createJoinServiceDescriptor(type, id),
        triggerJoinReconciler: (reason) => this.triggerJoinReconciler(reason),
        getBootstrapResponse: () => this.bootstrapResponse,
        getBootstrapReadinessState: () => this.bootstrapReadinessState,
        getSeedNodeId: () => this.seedNodeId,
        getSeedNodeAddress: () => this.seedNodeAddress,
        getHttpPostImpl: () => this.httpPostImpl,
        resolveJoinRetryPolicy: () => this.resolveJoinRetryPolicy(),
        classifySeedContactFailure: (err, msg) =>
          this.classifySeedContactFailure(err, msg),
        computeSeedContactRetryDelayMs: (opts) =>
          this.computeSeedContactRetryDelayMs(opts),
        upsertSystemTableRow: (table, data) =>
          this.upsertSystemTableRow(table, data),
        upsertSystemTableRowWithRetry: (table, data, options) =>
          this.upsertSystemTableRowWithRetry(table, data, options),
        upsertJoinServiceRowWithRetry: (rowData, options) =>
          this.upsertJoinServiceRowWithRetry(rowData, options),
        seedJoinTimeCacheRow: (table, data) =>
          this.seedJoinTimeCacheRow(table, data),
        registerMessageGroupService: (gId, rId, svc, opts) =>
          this.registerMessageGroupService(gId, rId, svc, opts),
      },
    }); // Join message group phase (extracted helper)
    this.joinMessageGroupRuntimeOwner = new JoinMessageGroupRuntimeOwner({
      nodeId: this.nodeId,
      delegates: {
        getLogger: () => this.logger,
        getMessageRouter: () => this.messageRouter,
        getMessageGroupServices: () => this.messageGroupServices,
        getBootstrapResponse: () => this.bootstrapResponse,
        queueJoinServiceReplica: (desc, opts) =>
          this.queueJoinServiceReplica(desc, opts),
        createJoinServiceDescriptor: (type, id) =>
          this.createJoinServiceDescriptor(type, id),
        triggerJoinReconciler: (reason) => this.triggerJoinReconciler(reason),
        registerMessageGroupService: (gId, rId, svc, opts) =>
          this.registerMessageGroupService(gId, rId, svc, opts),
      },
    }); // Error tracking
    this.lastError = null; // Tracks join phases completed before JOINING state for
    // retroactive sub-phase application (D5.1, Req 4.1).
    this._completedJoinPhases = [];
    this.startupServiceLifecycleOwner = new StartupServiceLifecycleOwner({
      reconcilerRequiredError:
        NODE_JOINING_SERVICE_LITERAL.JOIN_RECONCILER_MUST_BE_INITIALIZED_BEFORE_RECONCILIATION,
      delegates: {
        getNodeId: () => this.nodeId,
        getPhase: () => this.phase,
        getServiceLifecycleManager: () => this.serviceLifecycleManager,
        setServiceLifecycleManager: (value) => {
          this.serviceLifecycleManager = value;
        },
        getServiceReconciler: () => this.serviceReconciler,
        setServiceReconciler: (value) => {
          this.serviceReconciler = value;
        },
        createMessageGroupReplica: (context) =>
          this.createJoinMessageGroupReplica(context),
        startMessageGroupReplica: (replicaHandle, context) =>
          this.startJoinMessageGroupReplica(replicaHandle, context),
        stopMessageGroupReplica: (replicaHandle, context) =>
          this.stopJoinMessageGroupReplica(replicaHandle, context),
        createPartitionReplica: (context) =>
          this.createJoinPartitionReplica(context),
        startPartitionReplica: (replicaHandle, context) =>
          this.startJoinPartitionReplica(replicaHandle, context),
        stopPartitionReplica: (replicaHandle, context) =>
          this.stopJoinPartitionReplica(replicaHandle, context),
        getServiceRuntimeLifecycle: () => this.serviceRuntimeLifecycle,
        readDesiredState: () => [
          ...this.joinDesiredServiceDefinitions.values(),
        ],
        readActualState: () => this.buildJoinActualStateRows(),
        getCheckIntervalMs: () => JOINING_UNIFIED_RECONCILE.CHECK_INTERVAL_MS,
        clearDesiredState: () => {
          this.joinDesiredServiceDefinitions.clear();
          this.joinReplicaOptionsByServiceId.clear();
          this.joinMessageGroupReplicas = [];
        },
      },
    });
    this.runtimeSurfaceOwner = new StartupRuntimeSurfaceOwner({
      delegates: {
        getNodeId: () => this.nodeId,
        getOwner: () => this,
        getOnLocalAdminRuntimeReady: () => this.onLocalAdminRuntimeReady,
        getLocalAdminRuntimeReadyNotified: () =>
          this.localAdminRuntimeReadyNotified,
        setLocalAdminRuntimeReadyNotified: (value) => {
          this.localAdminRuntimeReadyNotified = value;
        },
        getSystemTableCache: () =>
          NodeService.getInstance().getSystemTableCache(),
        getCacheMutationTarget: () =>
          NodeService.getInstance().getSystemTableCache(),
        getMessageRouter: () => this.messageRouter,
        getPartitionServices: () => this.partitionServices,
        getMessageGroupServices: () => this.messageGroupServices,
        getTablePolicyService: () => this.tablePolicyService,
        getRebalanceCoordinator: () => this.rebalanceCoordinator,
      },
    });
  }
  /**
   * Build concern-scoped delegate bundles for join bootstrap (D2.2).
   *
   * Splits the monolithic join delegate surface into four bundles:
   * - phaseExecution: core accessors, service collections, lifecycle
   *   owners, and phase helper callbacks needed during phase execution
   * - readiness: lifecycle state machine and readiness state accessors
   * - cleanup: resource teardown helpers and state mutators for cleanup
   * - runtimeWiring: post-phase wiring accessors for runtime owners
   *
   * @return {Object} Keyed by JOIN_DELEGATE_BUNDLE concern names.
   */
  _buildJoinDelegateBundles() {
    return {
      [JOIN_DELEGATE_BUNDLE.PHASE_EXECUTION]:
        this._buildJoinPhaseExecutionDelegates(),
      [JOIN_DELEGATE_BUNDLE.READINESS]: this._buildJoinReadinessDelegates(),
      [JOIN_DELEGATE_BUNDLE.CLEANUP]: this._buildJoinCleanupDelegates(),
      [JOIN_DELEGATE_BUNDLE.RUNTIME_WIRING]:
        this._buildJoinRuntimeWiringDelegates(),
    };
  }
  /**
   * Compose join delegates from bundles for a specific consumer.
   *
   * @param {Object} bundles - Output of _buildJoinDelegateBundles().
   * @param {Object} [options={}] - Composition options.
   * @param {boolean} [options.cleanupOnly=false] - When true, returns
   *   only cleanup + readiness delegates (for JoinCleanupHandler).
   * @return {Object} Merged delegate map.
   */
  _composeJoinDelegates(bundles, options = {}) {
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
  /**
   * Phase execution delegates for join bootstrap.
   * Core accessors, service collections, lifecycle owners, and
   * phase helper callbacks needed during phase execution.
   * @return {Object} Phase execution delegate map.
   * @private
   */
  _buildJoinPhaseExecutionDelegates() {
    const self = this;
    return {
      // -- Core accessors --
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
      getHttpPostImpl: () => self.httpPostImpl, // -- Service collections --
      getMessageRouter: () => self.messageRouter,
      getTransport: () => self.transport,
      getMessageGroupServices: () => self.messageGroupServices,
      getPartitionServices: () => self.partitionServices,
      getJoinMessageGroupReplicas: () => self.joinMessageGroupReplicas, // -- Bootstrap response --
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
      }, // -- State mutators --
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
      }, // -- Phase helper callbacks (D2.3: direct owner invocation) --
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
  /**
   * Read the current runtime cache reference without forcing bootstrap peers
   * to branch on one specific startup handoff timing.
   * @return {Object|null}
   */
  peekSystemTableCache() {
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
    return (
      nodeService?._readOnlyCache || nodeService?._systemTableCache || null
    );
  }
  /**
   * Readiness delegates for join bootstrap.
   * Lifecycle state machine and readiness state accessors.
   * @return {Object} Readiness delegate map.
   * @private
   */
  _buildJoinReadinessDelegates() {
    const self = this;
    return {
      getLifecycleStateMachine: () => self.lifecycleStateMachine,
      getBootstrapReadinessState: () => self.bootstrapReadinessState,
    };
  }
  /**
   * Cleanup delegates for join bootstrap.
   * Resource teardown helpers and state mutators for cleanup.
   * @return {Object} Cleanup delegate map.
   * @private
   */
  _buildJoinCleanupDelegates() {
    const self = this;
    return {
      // -- Core accessors needed for cleanup diagnostics --
      getNodeId: () => self.nodeId,
      getLogger: () => self.logger,
      getNow: () => self.now,
      getPhase: () => self.phase,
      getStartTime: () => self.startTime, // -- Service collections --
      getMessageGroupServices: () => self.messageGroupServices,
      getPartitionServices: () => self.partitionServices,
      getMessageRouter: () => self.messageRouter,
      getTransport: () => self.transport,
      getBootstrapResponse: () => self.bootstrapResponse, // -- State mutators --
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
      }, // -- Membership state --
      getRegisteredJoinNodeId: () => {
        const systemTableCache =
          NodeService.getInstance().getSystemTableCache();
        const nodeRow = systemTableCache?.get?.(TABLES.NODES, self.nodeId);
        return nodeRow ? self.nodeId : null;
      },
      getJoinLifecycleIntentType: () =>
        resolveMembershipJoinIntentType(self.startupMode), // -- Resource teardown helpers --
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
      stopJoiningLifecycleOwners: () => self.stopJoiningLifecycleOwners(),
      emit: (event, data) => self.emit(event, data),
    };
  }
  /**
   * Runtime wiring delegates for join bootstrap.
   * Post-phase wiring accessors for runtime owners.
   * @return {Object} Runtime wiring delegate map.
   * @private
   */
}

export {NodeJoiningServiceSegment1};
