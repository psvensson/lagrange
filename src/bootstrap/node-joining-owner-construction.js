import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {
  createNodeJoiningRuntimeDependencyOwner,
  defineNodeJoiningRuntimeDependencyProperties,
  assignNodeJoiningDelegateBundleMethods,
  installNodeJoiningStatePublicationOwner,
} from './node-joining-delegate-bundles.js';

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
  QuerySystemStatePhase,
  STARTUP_JOIN_MODE,
  STORAGE_DEFAULT,
  StartupRuntimeHandoffOwner,
  StartupRuntimeSurfaceOwner,
  StartupServiceLifecycleOwner,
  TablePolicyService,
  WaitForLeadershipPhase,
  WorkClassScheduler,
  _deriveWsAddressFromNodeAddress,
  _formatLeaderMetadataDetails,
  _parseBootstrapError,
  _resolveSeedContactRetryAfterMs,
  assertCritical,
  assertRequiredControlPlaneRollout,
  buildMembershipOwnerOutcome,
  createJoiningPhaseOwners,
  createRuntimeStartupWiring,
  resolveMembershipJoinIntentType,
  uuidv4,
} = NODE_JOINING_SERVICE_SHARED;

/**
 * Normalize the optional seed contact candidate list.
 * @param {*} seedNodeAddresses
 * @return {string[]}
 */
function normalizeSeedNodeAddresses(seedNodeAddresses) {
  if (!Array.isArray(seedNodeAddresses)) {
    return [];
  }
  return seedNodeAddresses.filter((seedAddress) =>
    typeof seedAddress === 'string' && seedAddress.length > 0,
  );
}

class NodeJoiningOwnerConstruction extends EventEmitter {
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
    this.seedNodeAddresses =
      normalizeSeedNodeAddresses(options.seedNodeAddresses);
    this.seedNodeWsAddress = options.seedNodeWsAddress || null;
    this.seedNodeId = null; // Allow explicit 0 to mean "do not start a WebSocket server" (useful in tests/sandboxes).
    this.wsPort = options.wsPort ?? null;
    this.dataDir = options.dataDir || STORAGE_DEFAULT.DATA_DIR;
    this.config = {...JOINING_DEFAULT, ...options.config};
    this.config.replicaStaggerDelayMs = Number.isFinite(
      this.config.replicaStaggerDelayMs,
    ) ?
      Math.max(0, this.config.replicaStaggerDelayMs) :
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
        1,
        Math.max(0, this.config.leadershipWaitJitterRatio),
      ) :
      JOINING_DEFAULT.leadershipWaitJitterRatio;
    this.workClassScheduler =
      options.workClassScheduler || new WorkClassScheduler();
    this.random =
      typeof options.random === 'function' ? options.random : Math.random;
    this.now =
      typeof options.now === 'function' ? options.now : () => Date.now();
    this.sleep =
      typeof options.sleep === 'function' ?
        options.sleep :
        (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
    this.joinSessionIdProvided =
      typeof options.joinSessionId === 'string' &&
      options.joinSessionId.length > 0;
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
      typeof options.onLocalAdminRuntimeReady === 'function' ?
        options.onLocalAdminRuntimeReady :
        null;
    this.localAdminRuntimeReadyNotified = false;
    this.joinSessionStore = this.joinCoordinator.joinSessionStore;
    this.joinReadinessSnapshotProvider =
      typeof options.joinReadinessSnapshotProvider === 'function' ?
        options.joinReadinessSnapshotProvider :
        null;
    this.bootstrapReadinessState = options.readinessState || null;
    this.startupMode =
      typeof options.startupMode === 'string' &&
      options.startupMode.length > 0 ?
        options.startupMode :
        STARTUP_JOIN_MODE.FRESH_JOIN;
    this.membershipOwnerOutcome = buildMembershipOwnerOutcome({
      membershipOwnerOutcome: options.membershipOwnerOutcome,
      startupMode: this.startupMode,
    });
    this.clusterIncarnationFence =
      options.clusterIncarnationFence &&
      typeof options.clusterIncarnationFence === 'object' ?
        options.clusterIncarnationFence :
        null;
    this.membershipLifecycleController =
      options.membershipLifecycleController &&
      typeof options.membershipLifecycleController.submitJoinIntent ===
        'function' ?
        options.membershipLifecycleController :
        new MembershipLifecycleController({
          nodeId: this.nodeId,
          startupMode: this.startupMode,
          membershipOwnerOutcome: this.membershipOwnerOutcome,
          now: this.now,
        }); // Allow tests to bypass real network I/O by providing an in-process HTTP POST.
    this.httpPostImpl =
      typeof options.httpPost === 'function' ?
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
    this.serviceLifecycleCommandOwner = null;
    this.serviceInstallationReconcilerOwnerHandle = null;
    this.systemMetadataOwners = null;
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
    this.runtimeDependencyOwner = createNodeJoiningRuntimeDependencyOwner({
      service: this,
      runtimeWiring,
    });
    defineNodeJoiningRuntimeDependencyProperties(this);
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
    installNodeJoiningStatePublicationOwner(this); // Node lifecycle state machine for explicit state transitions
    // Requirements: 2.1, 2.2, 2.3, 2.4
    this.lifecycleStateMachine = new NodeLifecycleStateMachine({
      nodeId: this.nodeId,
      initialState: NodeState.STARTING,
    }); // Bootstrap response from seed node
    this.bootstrapResponse = null; // Joining state
    this.seedContactStartupAuthority = null;
    this.lastRetryableSeedContactEvidence = null;
    this.seedContactDiagnostics = null;
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
    this.outerReattemptMembershipRestorePending = false;
    this.handoffPreviousLifecycleStateMachine(
      options.previousLifecycleStateMachine,
    );
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
        getRouteSource: () => this.nodeAddress,
        isDistributedTransactionRecoveryAvailable: () =>
          typeof this.sqlQueryEngine
            ?.activateDistributedTransactionRecovery === 'function',
        activateDistributedTransactionRecovery: () => {
          const sqlQueryEngine = this.sqlQueryEngine;
          if (
            typeof sqlQueryEngine?.activateDistributedTransactionRecovery !==
            'function'
          ) {
            return;
          }
          return sqlQueryEngine.activateDistributedTransactionRecovery();
        },
        flushDeferredCreateSelfHostedMetadata: () => {
          if (
            typeof this.createMessageGroupPhase
              ?.flushDeferredCreateSelfHostedMetadata !== 'function'
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
        getSeedNodeAddresses: () => this.seedNodeAddresses,
        setSeedNodeAddress: (v) => {
          this.rebindSeedContactAddress(v);
        },
        getNodeAddress: () => this.nodeAddress,
        getJoinStartupMode: () => this.startupMode,
        getMembershipOwnerOutcome: () => this.membershipOwnerOutcome,
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
        getLastRetryableSeedContactEvidence: () =>
          this.lastRetryableSeedContactEvidence,
        setLastRetryableSeedContactEvidence: (v) => {
          this.lastRetryableSeedContactEvidence = v || null;
        },
        setSeedContactStartupAuthority: (v) => {
          this.seedContactStartupAuthority = v || null;
        },
        setSeedContactDiagnostics: (v) => {
          this.seedContactDiagnostics = v || null;
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
        getConfig: () => this.config,
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
            value && typeof value === 'object' ? value : null;
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
          resolveMembershipJoinIntentType({
            membershipOwnerOutcome: this.membershipOwnerOutcome,
            startupMode: this.startupMode,
          }),
        getJoinStartupMode: () => this.startupMode,
        getMembershipOwnerOutcome: () => this.membershipOwnerOutcome,
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
   * Rebind the selected HTTP bootstrap route after an alternate candidate
   * returns the canonical bootstrap response. Later join-time HTTP consumers
   * must follow the route that actually admitted this join.
   * @param {string} seedNodeAddress
   * @return {void}
   */
  rebindSeedContactAddress(seedNodeAddress) {
    if (typeof seedNodeAddress !== 'string' ||
        seedNodeAddress.length === 0) {
      return;
    }
    this.seedNodeAddress = seedNodeAddress;
    this.seedNodeAddresses = [
      seedNodeAddress,
      ...this.seedNodeAddresses.filter((candidate) =>
        candidate !== seedNodeAddress,
      ),
    ];
  }

  /**
   * Claim the canonical NodeService lifecycle from the exact stopped owner of
   * an entrypoint-level join reattempt. Terminal join cleanup deliberately
   * retains the NodeService singleton and its cache, so the next
   * NodeJoiningService must perform an explicit compare-and-swap instead of
   * letting query-system-state silently keep the predecessor's owner.
   *
   * @param {NodeLifecycleStateMachine|null} previousLifecycleStateMachine
   * @return {void}
   */
  handoffPreviousLifecycleStateMachine(previousLifecycleStateMachine) {
    if (!previousLifecycleStateMachine) {
      return;
    }
    const nodeService = NodeService.getInstance();
    if (!nodeService.isInitialized()) {
      return;
    }
    assertCritical(
      nodeService.getNodeId() === this.nodeId &&
        previousLifecycleStateMachine instanceof NodeLifecycleStateMachine &&
        previousLifecycleStateMachine.getState() === NodeState.STOPPED &&
        nodeService.getLifecycleStateMachine() ===
          previousLifecycleStateMachine,
      JOINING_ERROR_MSG.LIFECYCLE_STATE_MACHINE_REBIND_FAILED,
    );
    assertCritical(
      nodeService.replaceExternallyManagedLifecycleStateMachine(
        previousLifecycleStateMachine,
        this.lifecycleStateMachine,
      ),
      JOINING_ERROR_MSG.LIFECYCLE_STATE_MACHINE_REBIND_FAILED,
    );
    // The predecessor reached terminal cleanup before the entrypoint chose an
    // outer reattempt. That cleanup deliberately withdrew join admission, so a
    // durable MEMBERSHIP_WRITTEN checkpoint no longer describes live state.
    // Re-run its idempotent owner once; inner retries keep the repaired state.
    this.outerReattemptMembershipRestorePending = true;
  }
}

assignNodeJoiningDelegateBundleMethods(NodeJoiningOwnerConstruction);

export {NodeJoiningOwnerConstruction};
