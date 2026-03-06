/**
 * Node Joining Service - Handles new node joining an existing cluster.
 *
 * Bootstrap Process:
 * 1. Contact seed node via HTTP to get bootstrap response
 * 2. Bootstrap response contains default cache-sync table snapshots
 * 3. Hydrate local system cache from snapshots
 * 4. System cache becomes single source of truth for query routing
 * 5. Subscribe to CDC events to keep cache updated
 * 6. Register node in cluster via system cache routing
 *
 * System Cache Architecture:
 * - All cluster state stored in system tables
 * - System cache populated from bootstrap snapshots
 * - CDC events keep cache synchronized across all nodes
 * - All queries route through system cache (no bootstrap directories)
 * - Cache provides partition locations and leader addresses
 *
 * Requirements: 4.1, 4.6, 4.7, 7.8, 7.10, 7.11, 7.14
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {NodeService} from '../node/node-service.js';
import {
  resolveMessageGroupTargetAddressFromCache,
} from '../message-group/message-group-target-resolver.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from './message-group-assignment.js';
import {ReplicaHandlerSetup} from './shared/replica-handler-setup.js';
import {CDCIntegrationSetup} from './shared/cdc-integration-setup.js';
import {ControlPlaneSetup} from './shared/control-plane-setup.js';
import {LatencyTopologySetup} from './shared/latency-topology-setup.js';
import {PartitionService} from '../partition/partition-service.js';
import {
  NodeLifecycleStateMachine,
  NodeState,
} from '../node/node-lifecycle-state-machine.js';
import {
  CACHE_DEFAULT,
  CACHE_HYDRATION_TABLES,
  CDC_PROPAGATED_TABLES,
} from '../cache/cache-constants.js';
import {
  CDCPipelineReadinessGate,
} from '../cdc/cdc-pipeline-readiness-gate.js';
import {
  CDC_LIFECYCLE_LOG_MSG,
} from '../constants/cdc-lifecycle-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {SQLQueryEngine} from '../query/sql-query-engine.js';
import {TablePolicyService} from '../policy/table-policy-service.js';
import {NodeStorageBudgetSetup} from './shared/node-storage-budget-setup.js';
import {
  BOOTSTRAP_EVENT,
  BOOTSTRAP_SUBSYSTEM,
  JOINING_PHASE,
} from './bootstrap-constants.js';
import {
  JOIN_BACKFILL_QUERY,
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOINING_LOG_MSG,
  JOINING_UNIFIED_RECONCILE,

} from './node-joining-constants.js';
import {createRuntimeStartupWiring} from '../runtime/runtime-startup-wiring.js';
import {
  WORK_CLASS,
  WorkClassScheduler,
} from '../runtime/work-class-scheduler.js';
import {
  JoinReadinessEvaluator,
} from './join-readiness-evaluator.js';
import {
  JoinCleanupHandler,
} from './join-cleanup-handler.js';
import {
  ContactSeedPhase,
  parseBootstrapError as _parseBootstrapError,
  formatLeaderMetadataDetails as _formatLeaderMetadataDetails,
  resolveSeedContactRetryAfterMs as _resolveSeedContactRetryAfterMs,
} from './phases/contact-seed-phase.js';
import {
  ConnectWebSocketPhase,
  deriveWsAddressFromNodeAddress as _deriveWsAddressFromNodeAddress,
} from './phases/connect-websocket-phase.js';
import {
  QuerySystemStatePhase,
} from './phases/query-system-state-phase.js';
import {
  WaitForLeadershipPhase,
} from './phases/wait-for-leadership-phase.js';
import {
  CreateMessageGroupPhase,
} from './phases/create-message-group-phase.js';
import {
  JoinMessageGroupPhase,
} from './phases/join-message-group-phase.js';
import {
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  assertRequiredControlPlaneRollout,
} from '../runtime/control-plane-rollout-controls.js';
import {RPCClient} from '../transport/rpc-client.js';
import {
  ControlPlaneMessageType,
  ControlPlaneField,
  DEFAULT_NODE_CAPABILITIES,
} from '../control-plane/control-plane-constants.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
import {
  COLUMN,
  NUM,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  STRING,
  TABLES,
  TYPEOF,
  TIME_MS,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';

import {CDC_EVENT} from '../cdc/cdc-constants.js';
import {createJoiningPhaseOwners} from './owners/join-phase-owners.js';
import {StartupPipelineRunner} from './pipeline/startup-pipeline-runner.js';
import {createJoinStartupPlan} from './pipeline/join-startup-plan.js';
import {
  PgWireStartupSafetyGate,
} from './pgwire-startup-safety-gate.js';
import {
  RuntimeServiceHandlerSetup,
} from './shared/runtime-service-handler-setup.js';
import {
  MessageGroupServiceHandlerSetup,
} from './shared/message-group-service-handler-setup.js';
import {
  resolveCanonicalRequiredSchemaVersion as _resolveCanonicalRequiredSchemaVersion,
  resolveCanonicalAppliedSchemaVersion as _resolveCanonicalAppliedSchemaVersion,
  extractCanonicalSnapshotSchemaVersion as _extractCanonicalSnapshotSchemaVersion,
  extractCanonicalCacheSchemaVersion as _extractCanonicalCacheSchemaVersion,
  extractCanonicalTableMetadataSchemaVersion
  as _extractCanonicalTableMetadataSchemaVersion,
  extractJoinSchemaVersionFromRecord as _extractJoinSchemaVersionFromRecord,
  selectNewestJoinSchemaVersion as _selectNewestJoinSchemaVersion,
  normalizeJoinSchemaVersion as _normalizeJoinSchemaVersion,
  compareJoinSchemaVersions as _compareJoinSchemaVersions,
  tryParseJoinSchemaHlc as _tryParseJoinSchemaHlc,
} from './join-schema-version-resolver.js';
import {
  MessageGroupServiceAdapter,
  RuntimeServiceAdapter,
  ServiceLifecycleManager,
  ServiceReconciler,
} from '../service/index.js';

const JoiningPhase = JOINING_PHASE;
const JoiningEvent = BOOTSTRAP_EVENT;
import {
  shouldAttachPartitionCdcPropagation,
} from './shared/cdc-propagation-filter.js';


/**
 * NodeJoiningService handles the process of a new node joining an existing cluster.
 */
class NodeJoiningService extends EventEmitter {
  /**
   * Create a new NodeJoiningService.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - This node's ID (generated if not provided).
   * @param {string} options.nodeAddress - This node's address.
   * @param {string} options.seedNodeAddress - Seed node address to contact.
   * @param {string} options.seedNodeWsAddress - Seed node WebSocket address.
   * @param {number} options.wsPort - WebSocket port for this node.
   * @param {string} options.dataDir - Base data directory for partition storage.
   * @param {Function} [options.httpPost] - Optional HTTP POST implementation override (for tests).
   */
  constructor(options = {}) {
    super();

    this.rolloutControls = assertRequiredControlPlaneRollout({
      owner: 'NodeJoiningService',
      controls: options.rolloutControls,
      required: CONTROL_PLANE_ROLLOUT_REQUIRED.NODE_JOINING_SERVICE,
    });
    this.nodeId = options.nodeId || uuidv4();
    this.nodeAddress = options.nodeAddress || null;
    this.seedNodeAddress = options.seedNodeAddress || null;
    this.seedNodeWsAddress = options.seedNodeWsAddress || null;
    this.seedNodeId = null;
    // Allow explicit 0 to mean "do not start a WebSocket server" (useful in tests/sandboxes).
    this.wsPort = options.wsPort ?? null;
    this.dataDir = options.dataDir || STORAGE_DEFAULT.DATA_DIR;
    this.config = {...JOINING_DEFAULT, ...options.config};
    this.config.replicaStaggerDelayMs = Number.isFinite(this.config.replicaStaggerDelayMs) ?
      Math.max(NUM.ZERO, this.config.replicaStaggerDelayMs) :
      JOINING_DEFAULT.replicaStaggerDelayMs;
    this.config.heartbeatIntervalMs = Number.isFinite(this.config.heartbeatIntervalMs) ?
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
    this.workClassScheduler = options.workClassScheduler ||
      new WorkClassScheduler();
    this.random = typeof options.random === TYPEOF.FUNCTION ?
      options.random :
      Math.random;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.sleep = typeof options.sleep === TYPEOF.FUNCTION ?
      options.sleep :
      (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
    this.joinReadinessSnapshotProvider =
      typeof options.joinReadinessSnapshotProvider === TYPEOF.FUNCTION ?
        options.joinReadinessSnapshotProvider :
        null;

    // Allow tests to bypass real network I/O by providing an in-process HTTP POST.
    this.httpPostImpl = typeof options.httpPost === TYPEOF.FUNCTION ?
      options.httpPost :
      this.httpPost.bind(this);

    // Services created during joining
    this.messageGroupServices = new Map();
    this.partitionServices = new Map();
    this.transport = null;
    // MessageRouter for unified local/remote message routing
    this.messageRouter = null;
    // Unified lifecycle desired-state descriptors for join-created services.
    this.joinDesiredServiceDefinitions = new Map();
    // Join replica creation options keyed by canonical serviceId.
    this.joinReplicaOptionsByServiceId = new Map();
    // Track message-group replicas created for deferred election start.
    this.joinMessageGroupReplicas = [];
    // Unified lifecycle owners for joining message-group startup.
    this.serviceLifecycleManager = null;
    this.serviceReconciler = null;

    // Replica handler for CREATE_REPLICA/REMOVE_REPLICA execution
    this.replicaHandler = null;

    // Replica state machine for tracking replica lifecycle states
    this.replicaStateMachine = null;

    // Decomposed control plane services
    this.heartbeatService = null;
    this.leaseService = null;
    this.endpointService = null;
    this.dispatchService = null;
    this.rebalanceCoordinator = null;
    this.controlPlaneBackgroundWritersActivated = false;
    this.controlPlaneHeartbeatStartOptions = null;

    // Unified runtime ownership wiring.
    const runtimeWiring = createRuntimeStartupWiring({
      ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled),
    });
    this.runtimeDriverRegistry = runtimeWiring.runtimeDriverRegistry;
    this.serviceRuntimeLifecycle = runtimeWiring.serviceRuntimeLifecycle;
    this.runtimeDrivers = runtimeWiring.drivers;

    // RPC client for control plane dispatch
    this.rpcClient = null;

    // CDC integration service for system table writes
    this.cdcIntegrationService = null;
    // Storage budget owner for node registration
    this.nodeStorageBudgetService = null;
    // Table policy service for partition placement decisions
    this.tablePolicyService = null;
    this.latencyTopology = null;
    // Track system cache hydration state for rebalancer initialization
    this.systemCacheHydrated = false;
    // Track CDC subscription status
    this.cdcSubscriptionsActive = false;
    // Control plane target address for control messages
    this.controlPlaneTargetAddress = null;
    this.pendingClusterMeshReconciliation = null;

    // Node lifecycle state machine for explicit state transitions
    // Requirements: 2.1, 2.2, 2.3, 2.4
    this.lifecycleStateMachine = new NodeLifecycleStateMachine({
      nodeId: this.nodeId,
      initialState: NodeState.STARTING,
    });

    // Bootstrap response from seed node
    this.bootstrapResponse = null;

    // Joining state
    this.phase = JoiningPhase.NOT_STARTED;
    this.startTime = null;
    this.phaseStartTime = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.NODE_JOINING);
    this.logger.debug(JOINING_LOG_MSG.RUNTIME_WIRING_READY, {
      nodeId: this.nodeId,
      owner: 'createRuntimeStartupWiring',
      runtimeDriverCount: Object.keys(this.runtimeDrivers).length,
      ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled),
    });
    this.joiningPhaseOwners = createJoiningPhaseOwners(this);

    // Join readiness evaluator (extracted helper)
    this.joinReadinessEvaluator = new JoinReadinessEvaluator({
      nodeId: this.nodeId,
      now: this.now,
      sleep: this.sleep,
      delegates: {
        resolveControlPlaneTargetAddress: (opts) =>
          this.resolveControlPlaneTargetAddress(opts),
        getMissingSystemServiceLeaders: (cache) =>
          this.getMissingSystemServiceLeaders(cache),
        getBlockingSystemServiceLeaders: (missing, cache) =>
          this.getBlockingSystemServiceLeaders(missing, cache),
        backfillPropagatedCacheTables: (tables) =>
          this.backfillPropagatedCacheTablesFromAuthoritativeState(
            tables,
          ),
        getMessageRouter: () => this.messageRouter,
        getBootstrapResponse: () => this.bootstrapResponse,
        getSystemCacheHydrated: () => this.systemCacheHydrated,
        getJoinReadinessSnapshotProvider: () =>
          this.joinReadinessSnapshotProvider,
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getLogger: () => this.logger,
        getConfig: () => this.config,
      },
    });

    // Contact seed phase (extracted helper)
    this.contactSeedPhase = new ContactSeedPhase({
      nodeId: this.nodeId,
      delegates: {
        getSeedNodeAddress: () => this.seedNodeAddress,
        getNodeAddress: () => this.nodeAddress,
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
        getSeedNodeId: () => this.seedNodeId,
        setSeedNodeId: (v) => {
          this.seedNodeId = v;
        },
        getSeedNodeWsAddress: () => this.seedNodeWsAddress,
        setSeedNodeWsAddress: (v) => {
          this.seedNodeWsAddress = v;
        },
      },
    });

    // Connect WebSocket phase (extracted helper)
    this.connectWebSocketPhase = new ConnectWebSocketPhase({
      nodeId: this.nodeId,
      delegates: {
        getWsPort: () => this.wsPort ?? this.config.wsPort,
        getNodeAddress: () => this.nodeAddress,
        getLogger: () => this.logger,
        getIdentifyPayload: () =>
          this.getIdentifyBootstrapPayload(),
        getMessageRouter: () => this.messageRouter,
        setMessageRouter: (v) => {
          this.messageRouter = v;
        },
        setTransport: (v) => {
          this.transport = v;
        },
        getLeaderMessageGroupService: () =>
          this.getLeaderMessageGroupService(),
        initializeJoiningLifecycleOwners: () =>
          this.initializeJoiningLifecycleOwners(),
        triggerJoinReconciler: (reason) =>
          this.triggerJoinReconciler(reason),
        getSeedNodeWsAddress: () => this.seedNodeWsAddress,
        getSeedNodeId: () => this.seedNodeId,
        sendControlPlaneNodeStateUpdate: (opts) =>
          this.sendControlPlaneNodeStateUpdate(opts),
        getNodeCapabilities: () =>
          this.getNodeCapabilities(),
        resolveMeshConnectivityNodeRows: () =>
          this.resolveMeshConnectivityNodeRows(),
        buildClusterMeshSignature: (rows) =>
          this.buildClusterMeshSignature(rows),
        setLastClusterMeshSignature: (sig) => {
          this.joinReadinessEvaluator
            .lastClusterMeshSignature = sig;
        },
      },
    });

    // Join cleanup handler (extracted helper)
    this.joinCleanupHandler = new JoinCleanupHandler({
      nodeId: this.nodeId,
      delegates: {
        getLogger: () => this.logger,
        getNow: () => this.now,
        getPhase: () => this.phase,
        setPhase: (p) => {
          this.phase = p;
        },
        getLastError: () => this.lastError,
        setLastError: (e) => {
          this.lastError = e;
        },
        getStartTime: () => this.startTime,
        getBootstrapResponse: () => this.bootstrapResponse,
        getMessageGroupServices: () => this.messageGroupServices,
        getPartitionServices: () => this.partitionServices,
        getTransport: () => this.transport,
        setTransport: (v) => {
          this.transport = v;
        },
        getMessageRouter: () => this.messageRouter,
        setMessageRouter: (v) => {
          this.messageRouter = v;
        },
        getCdcIntegrationService: () =>
          this.cdcIntegrationService,
        setCdcIntegrationService: (v) => {
          this.cdcIntegrationService = v;
        },
        getLifecycleStateMachine: () =>
          this.lifecycleStateMachine,
        getRebalanceCoordinator: () =>
          this.rebalanceCoordinator,
        setRebalanceCoordinator: (v) => {
          this.rebalanceCoordinator = v;
        },
        getLatencyTopology: () => this.latencyTopology,
        setLatencyTopology: (v) => {
          this.latencyTopology = v;
        },
        getReplicaStateMachine: () => this.replicaStateMachine,
        setReplicaStateMachine: (v) => {
          this.replicaStateMachine = v;
        },
        getRpcClient: () => this.rpcClient,
        setRpcClient: (v) => {
          this.rpcClient = v;
        },
        getHeartbeatService: () => this.heartbeatService,
        setHeartbeatService: (v) => {
          this.heartbeatService = v;
        },
        getLeaseService: () => this.leaseService,
        setLeaseService: (v) => {
          this.leaseService = v;
        },
        getEndpointService: () => this.endpointService,
        setEndpointService: (v) => {
          this.endpointService = v;
        },
        getDispatchService: () => this.dispatchService,
        setDispatchService: (v) => {
          this.dispatchService = v;
        },
        getReplicaHandler: () => this.replicaHandler,
        setReplicaHandler: (v) => {
          this.replicaHandler = v;
        },
        stopJoiningLifecycleOwners: () =>
          this.stopJoiningLifecycleOwners(),
        emit: (event, data) => this.emit(event, data),
      },
    });

    // Query system state phase (extracted helper)
    this.querySystemStatePhase = new QuerySystemStatePhase({
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      delegates: {
        getLogger: () => this.logger,
        getConfig: () => this.config,
        getNow: () => this.now,
        getWsPort: () => this.wsPort ?? this.config.wsPort,
        getBootstrapResponse: () => this.bootstrapResponse,
        getLifecycleStateMachine: () =>
          this.lifecycleStateMachine,
        getMessageRouter: () => this.messageRouter,
        getCdcIntegrationService: () =>
          this.cdcIntegrationService,
        getSystemCacheHydrated: () =>
          this.systemCacheHydrated,
        setSystemCacheHydrated: (v) => {
          this.systemCacheHydrated = v;
        },
        getCdcSubscriptionsActive: () =>
          this.cdcSubscriptionsActive,
        getPartitionServices: () => this.partitionServices,
        getMessageGroupServices: () =>
          this.messageGroupServices,
        getNodeStorageBudgetService: () =>
          this.getNodeStorageBudgetService(),
        ensureLatencyTopologyOwners: () =>
          this.ensureLatencyTopologyOwners(),
        ensureTablePolicyService: (cache) => {
          if (!this.tablePolicyService) {
            this.tablePolicyService = new TablePolicyService({
              systemTableCache: cache,
              cdcIntegrationService:
                this.cdcIntegrationService,
            });
            this.tablePolicyService.initialize();
          }
        },
        applySystemCacheToPartitions: (cache) => {
          for (const partition of
            this.partitionServices.values()) {
            partition.setSystemTableCache(cache);
            partition.setTablePolicyService(
              this.tablePolicyService,
            );
          }
        },
        waitForSystemServiceLeaders: (cache) =>
          this.waitForSystemServiceLeaders(cache),
        registerCreateSelfHostedMetadata: () =>
          this.registerCreateSelfHostedMetadata(),
        registerNodeInCluster: () =>
          this.registerNodeInCluster(),
        subscribeToCDCEvents: () =>
          this.subscribeToCDCEvents(),
        createCdcPipelineReadinessGate: (cache) =>
          this.createCdcPipelineReadinessGate(cache),
        backfillPropagatedCacheTablesFromAuthoritativeState:
          () => this
            .backfillPropagatedCacheTablesFromAuthoritativeState(),
        triggerJoinReconciler: (reason) =>
          this.triggerJoinReconciler(reason),
        stopJoiningLifecycleOwners: () =>
          this.stopJoiningLifecycleOwners(),
      },
    });

    // Wait for leadership phase (extracted helper)
    this.waitForLeadershipPhase = new WaitForLeadershipPhase({
      nodeId: this.nodeId,
      delegates: {
        getLogger: () => this.logger,
        getConfig: () => this.config,
        getNow: () => this.now,
        getSleep: () => this.sleep,
        getSystemTableCache: () =>
          NodeService.getInstance().getSystemTableCache(),
        getMessageGroupServicesSize: () =>
          this.messageGroupServices.size,
        getMessageGroupServices: () =>
          this.messageGroupServices,
        hasMessageGroupLeaderInCache: (cache) =>
          this.hasMessageGroupLeaderInCache(cache),
        getBootstrapResponse: () => this.bootstrapResponse,
      },
    });

    // Create message group phase (extracted helper)
    this.createMessageGroupPhase =
      new CreateMessageGroupPhase({
        nodeId: this.nodeId,
        delegates: {
          getLogger: () => this.logger,
          getConfig: () => this.config,
          getNow: () => this.now,
          getSleep: () => this.sleep,
          getMessageRouter: () => this.messageRouter,
          getMessageGroupServices: () =>
            this.messageGroupServices,
          getJoinMessageGroupReplicas: () =>
            this.joinMessageGroupReplicas,
          pushJoinMessageGroupReplica: (replica) => {
            this.joinMessageGroupReplicas.push(replica);
          },
          removeJoinMessageGroupReplica: (replica) => {
            this.joinMessageGroupReplicas =
              this.joinMessageGroupReplicas.filter(
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
          triggerJoinReconciler: (reason) =>
            this.triggerJoinReconciler(reason),
          getBootstrapResponse: () =>
            this.bootstrapResponse,
          getSeedNodeAddress: () =>
            this.seedNodeAddress,
          getHttpPostImpl: () => this.httpPostImpl,
          resolveJoinRetryPolicy: () =>
            this.resolveJoinRetryPolicy(),
          classifySeedContactFailure: (err, msg) =>
            this.classifySeedContactFailure(err, msg),
          computeSeedContactRetryDelayMs: (opts) =>
            this.computeSeedContactRetryDelayMs(opts),
          upsertSystemTableRow: (table, data) =>
            this.upsertSystemTableRow(table, data),
          registerMessageGroupService: (gId, rId, svc) =>
            this.registerMessageGroupService(gId, rId, svc),
        },
      });

    // Join message group phase (extracted helper)
    this.joinMessageGroupPhase =
      new JoinMessageGroupPhase({
        nodeId: this.nodeId,
        delegates: {
          getLogger: () => this.logger,
          getMessageRouter: () => this.messageRouter,
          getMessageGroupServices: () =>
            this.messageGroupServices,
          getBootstrapResponse: () =>
            this.bootstrapResponse,
          queueJoinServiceReplica: (desc, opts) =>
            this.queueJoinServiceReplica(desc, opts),
          createJoinServiceDescriptor: (type, id) =>
            this.createJoinServiceDescriptor(type, id),
          triggerJoinReconciler: (reason) =>
            this.triggerJoinReconciler(reason),
          registerMessageGroupService: (gId, rId, svc) =>
            this.registerMessageGroupService(gId, rId, svc),
        },
      });

    // Error tracking
    this.lastError = null;
  }

  /**
   * Execute the full joining process.
   * Requirements: 4.1, 4.6, 4.7, 8.1, 8.2, 8.3 - Bootstrap sequence with lifecycle states.
   * @return {Promise<Object>} Joining result.
   */
  async join() {
    this.startTime = this.now();

    this.logger.info(JOINING_LOG_MSG.STARTING, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      seedNodeAddress: this.seedNodeAddress,
      lifecycleState: this.lifecycleStateMachine.getState(),
    });

    try {
      // Transition to CONNECTING state
      // Requirements: 2.6 - CONNECTING state for establishing WebSocket connections
      this.lifecycleStateMachine.transition(NodeState.CONNECTING);

      const startupPipelineRunner = new StartupPipelineRunner({
        logger: this.logger,
        eventSink: this,
      });
      const joinPlan = createJoinStartupPlan(this);

      // Phase 1: Contact seed node via HTTP
      // Phase 2: Connect to seed node via WebSocket for cross-node communication
      // Requirements: 8.1, 8.2 - Start server and self-connect BEFORE creating services
      await startupPipelineRunner.run({
        phases: joinPlan.phases.slice(0, 2),
      });

      // Transition to DISCOVERING state
      // Requirements: 2.7 - DISCOVERING state for receiving system cache
      this.lifecycleStateMachine.transition(NodeState.DISCOVERING);

      // Phase 3: Create or join message group based on assignment
      // Phase 4: Wait for leadership establishment
      await startupPipelineRunner.run({
        phases: joinPlan.phases.slice(2, 4),
      });

      // Initialize ReplicaHandler BEFORE registering node in cluster
      // This is critical because:
      // 1. Node registration triggers CDC event on seed node
      // 2. CDC event triggers rebalancing which sends CREATE_REPLICA messages
      // 3. CREATE_REPLICA messages need the handler to be registered
      // If we initialize after registration, CREATE_REPLICA messages will timeout
      if (!this.rpcClient) {
        const leaderMessageGroup = assertCritical(
          this.getLeaderMessageGroupService(),
          JOINING_ERROR_MSG.MESSAGE_GROUP_LEADER_REQUIRED,
        );
        this.rpcClient = new RPCClient({messageGroupService: leaderMessageGroup});
      }

      this.createCdcIntegrationService();
      this.ensureLatencyTopologyOwners();
      this.initializeReplicaHandler();
      this.initializeMessageGroupServiceHandler();
      await this.initializeControlPlaneService();

      // Initialize runtime service handler AFTER control-plane readiness.
      // PG wire startup failure is isolated and does not abort join.
      this.initializeRuntimeServiceHandler();

      // Transition to JOINING state
      // Requirements: 2.8 - JOINING state for registering in cluster and proposing epoch
      this.lifecycleStateMachine.transition(NodeState.JOINING);

      // Phase 5: Query system partitions for cluster state
      // This includes registering the node in the cluster's nodes table
      await startupPipelineRunner.run({
        phases: joinPlan.phases.slice(4, 5),
      });

      await this.waitForCanonicalJoinReadinessConvergence();
      await this.signalReadyForReplicas();
      this.disableSteadyStateControlPlaneReporter();

      // Transition to READY state
      // Requirements: 2.10 - READY state for accepting traffic
      this.lifecycleStateMachine.transition(NodeState.READY);
      this.activateControlPlaneBackgroundWriters();
      this.startLatencyTopologyLifecycle();

      // Joining complete
      this.phase = JoiningPhase.COMPLETE;
      const duration = this.now() - this.startTime;

      this.logger.info(JOINING_LOG_MSG.COMPLETED, {
        nodeId: this.nodeId,
        duration,
        messageGroupCount: this.messageGroupServices.size,
        lifecycleState: this.lifecycleStateMachine.getState(),
      });

      this.emit(JoiningEvent.COMPLETE, {
        nodeId: this.nodeId,
        duration,
        messageGroupServices: this.messageGroupServices,
        transport: this.transport,
        messageRouter: this.messageRouter,
        lifecycleState: this.lifecycleStateMachine.getState(),
      });

      return {
        success: true,
        nodeId: this.nodeId,
        duration,
        messageGroupServices: this.messageGroupServices,
        partitionServices: this.partitionServices,
        replicaHandler: this.replicaHandler,
        replicaStateMachine: this.replicaStateMachine,
        transport: this.transport,
        messageRouter: this.messageRouter,
        bootstrapResponse: this.bootstrapResponse,
        lifecycleStateMachine: this.lifecycleStateMachine,
      };
    } catch (error) {
      return this.handleJoiningFailure(error);
    }
  }

  /**
   * Signal readiness to accept replica assignments.
   * @return {Promise<void>}
   * @private
   */
  async signalReadyForReplicas() {
    const heartbeat = assertCritical(
      this.heartbeatService,
      JOINING_ERROR_MSG.CONTROL_PLANE_SERVICE_REQUIRED,
    );

    const nodeService = NodeService.getInstance();
    const capabilities = this.getNodeCapabilities();
    const stats = await nodeService.getNodeStats();
    const heartbeatPayload = {
      cpu: {
        count: stats.cpu?.count,
        usagePercent: stats.cpu?.usagePercent,
      },
      memory: {
        totalBytes: stats.memory?.totalBytes,
        usagePercent: stats.memory?.usagePercent,
      },
      diskGb: stats.diskGb,
      diskUsagePercent: stats.diskUsagePercent,
    };
    const maxAttempts = Number.isFinite(this.config.readySignalMaxAttempts) ?
      Math.max(NUM.ONE, Math.floor(this.config.readySignalMaxAttempts)) :
      JOINING_DEFAULT.readySignalMaxAttempts;
    const maxDelayMs = Number.isFinite(this.config.readySignalRetryMaxDelayMs) ?
      Math.max(NUM.ONE, Math.floor(this.config.readySignalRetryMaxDelayMs)) :
      JOINING_DEFAULT.readySignalRetryMaxDelayMs;
    const backoffMultiplier =
      Number.isFinite(this.config.readySignalRetryBackoffMultiplier) &&
      this.config.readySignalRetryBackoffMultiplier > NUM.ZERO ?
        this.config.readySignalRetryBackoffMultiplier :
        JOINING_DEFAULT.readySignalRetryBackoffMultiplier;
    let delayMs = Number.isFinite(this.config.readySignalRetryDelayMs) ?
      Math.max(NUM.ONE, Math.floor(this.config.readySignalRetryDelayMs)) :
      JOINING_DEFAULT.readySignalRetryDelayMs;
    let lastError = null;

    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt++) {
      try {
        await heartbeat.sendHeartbeat(heartbeatPayload, capabilities);
        this.controlPlaneHeartbeatStartOptions = {
          getStats: () => nodeService.getNodeStats(),
          capabilities,
        };

        this.logger.info(JOINING_LOG_MSG.READY_SIGNAL_SUCCESS, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
        });
        return;
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) {
          break;
        }

        this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          nextDelayMs: delayMs,
          error: error.message,
        });
        await this.sleep(delayMs);
        delayMs = Math.min(
          Math.floor(delayMs * backoffMultiplier),
          maxDelayMs,
        );
      }
    }

    this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, {
      nodeId: this.nodeId,
      attempts: maxAttempts,
      error: lastError?.message || STRING.UNKNOWN,
    });
    throw lastError;
  }

  /**
   * Restrict control-plane heartbeat reporting to bootstrap readiness only.
   * Steady-state heartbeats must return to the canonical direct CDC path.
   * @return {void}
   * @private
   */
  disableSteadyStateControlPlaneReporter() {
    if (typeof this.heartbeatService?.setNodeStateReporter !== TYPEOF.FUNCTION) {
      return;
    }
    this.heartbeatService.setNodeStateReporter(null);
  }

  /**
   * Wait for canonical join readiness convergence before transitioning READY.
   * @return {Promise<void>}
   * @private
   */
  async waitForCanonicalJoinReadinessConvergence() {
    return this.joinReadinessEvaluator
      .waitForCanonicalJoinReadinessConvergence();
  }

  /**
   * Resolve join-readiness timeout.
   * @return {number}
   * @private
   */
  resolveJoinReadinessTimeoutMs() {
    return this.joinReadinessEvaluator.resolveJoinReadinessTimeoutMs();
  }

  /**
   * Resolve join-readiness poll interval.
   * @return {number}
   * @private
   */
  resolveJoinReadinessPollIntervalMs() {
    return this.joinReadinessEvaluator
      .resolveJoinReadinessPollIntervalMs();
  }

  /**
   * Refresh discovery-critical propagated tables while canonical join
   * readiness is blocked on topology visibility.
   * @param {Object|null} evaluation
   * @param {number} pollIntervalMs
   * @return {Promise<void>}
   * @private
   */
  async repairCanonicalJoinReadinessIfNeeded(
    evaluation,
    pollIntervalMs,
  ) {
    return this.joinReadinessEvaluator
      .repairCanonicalJoinReadinessIfNeeded(evaluation, pollIntervalMs);
  }

  /**
   * Determine the table scope for canonical join schema checks.
   * @return {string}
   * @private
   */
  resolveJoinReadinessTableName() {
    return this.joinReadinessEvaluator.resolveJoinReadinessTableName();
  }

  /**
   * Collect one canonical join-readiness snapshot.
   * @return {Promise<{snapshot: Object, error: Error|null}>}
   * @private
   */
  async collectCanonicalJoinReadinessSnapshot() {
    return this.joinReadinessEvaluator
      .collectCanonicalJoinReadinessSnapshot();
  }

  /**
   * Build canonical join-readiness snapshot from local control-plane state.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildCanonicalJoinReadinessSnapshot(context = {}) {
    return this.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot(context);
  }

  /**
   * Check whether control-plane target address is currently reachable.
   * @param {string|null} targetAddress
   * @return {boolean}
   * @private
   */
  isControlPlaneAddressReachable(targetAddress) {
    return this.joinReadinessEvaluator
      .isControlPlaneAddressReachable(targetAddress);
  }

  /**
   * Evaluate topology readiness for canonical join convergence.
   * @param {Object|null} systemTableCache
   * @return {Object}
   * @private
   */
  evaluateCanonicalJoinTopologyReadiness(systemTableCache) {
    return this.joinReadinessEvaluator
      .evaluateCanonicalJoinTopologyReadiness(systemTableCache);
  }

  /**
   * Ensure local discovery-critical endpoint rows cover every ACTIVE node.
   * @param {Object|null} systemTableCache
   * @return {Object}
   * @private
   */
  evaluateCanonicalJoinEndpointVisibility(systemTableCache) {
    return this.joinReadinessEvaluator
      .evaluateCanonicalJoinEndpointVisibility(systemTableCache);
  }

  /**
   * Return ACTIVE node ids visible in the local cache.
   * @param {Object|null} systemTableCache
   * @return {string[]}
   * @private
   */
  getCanonicalJoinActiveNodeIds(systemTableCache) {
    return this.joinReadinessEvaluator
      .getCanonicalJoinActiveNodeIds(systemTableCache);
  }

  /**
   * Resolve node rows used for mesh connectivity.
   * @return {{source: string, rows: Object[]}}
   * @private
   */
  resolveMeshConnectivityNodeRows() {
    return this.joinReadinessEvaluator
      .resolveMeshConnectivityNodeRows();
  }

  /**
   * Build a stable mesh-membership signature for connection
   * reconciliation.
   * @param {Array<Object>} nodeRows
   * @return {string}
   * @private
   */
  buildClusterMeshSignature(nodeRows) {
    return this.joinReadinessEvaluator
      .buildClusterMeshSignature(nodeRows);
  }

  /**
   * Determine whether steady-state READY heartbeats need mesh
   * reconciliation.
   * @return {boolean}
   * @private
   */
  shouldReconnectClusterMesh() {
    return this.joinReadinessEvaluator.shouldReconnectClusterMesh();
  }

  /**
   * Collect non-terminal replica operations from local cache.
   * @param {Object|null} systemTableCache
   * @return {Array<Object>}
   * @private
   */
  collectCanonicalInFlightReplicaOperationDetails(systemTableCache) {
    return this.joinReadinessEvaluator
      .collectCanonicalInFlightReplicaOperationDetails(
        systemTableCache,
      );
  }

  /**
   * Resolve node IDs required for join-readiness diagnostics.
   * @param {Object|null} systemTableCache
   * @return {Array<string>}
   * @private
   */
  resolveJoinReadinessRequiredNodeIds(systemTableCache) {
    return this.joinReadinessEvaluator
      .resolveJoinReadinessRequiredNodeIds(systemTableCache);
  }

  /**
   * Evaluate one canonical join-readiness snapshot.
   * @param {Object} snapshot
   * @return {Object}
   * @private
   */
  evaluateCanonicalJoinReadinessSnapshot(snapshot) {
    return this.joinReadinessEvaluator
      .evaluateCanonicalJoinReadinessSnapshot(snapshot);
  }

  /**
   * Classify canonical join-readiness reasons with stable precedence.
   * @param {Object} snapshot
   * @return {Array<string>}
   */
  classifyCanonicalJoinReadinessReasons(snapshot) {
    return this.joinReadinessEvaluator
      .classifyCanonicalJoinReadinessReasons(snapshot);
  }

  /**
   * Normalize one canonical join-readiness snapshot.
   * @param {Object} snapshot
   * @return {Object}
   * @private
   */
  normalizeCanonicalJoinReadinessSnapshot(snapshot) {
    return this.joinReadinessEvaluator
      .normalizeCanonicalJoinReadinessSnapshot(snapshot);
  }

  /**
   * Build per-node schema diagnostics for join timeout reporting.
   * @param {Object} evaluation
   * @return {Object}
   * @private
   */
  buildJoinSchemaDiagnosticsByNode(evaluation) {
    return this.joinReadinessEvaluator
      .buildJoinSchemaDiagnosticsByNode(evaluation);
  }

  /**
   * Rank one join-readiness reason according to stable precedence.
   * @param {string} reason
   * @return {number}
   * @private
   */
  getJoinReadinessReasonRank(reason) {
    return this.joinReadinessEvaluator
      .getJoinReadinessReasonRank(reason);
  }

  /**
   * Resolve the required schema version for canonical join checks.
   * @param {string} tableName
   * @param {Object|null} systemTableCache
   * @return {string|null}
   * @private
   */
  resolveCanonicalRequiredSchemaVersion(tableName, systemTableCache) {
    return _resolveCanonicalRequiredSchemaVersion(
      tableName,
      systemTableCache,
      this.bootstrapResponse?.systemTableSnapshots,
    );
  }

  /**
   * Resolve the applied schema version for canonical join checks.
   * @param {string} tableName
   * @param {Object|null} systemTableCache
   * @return {string|null}
   * @private
   */
  resolveCanonicalAppliedSchemaVersion(tableName, systemTableCache) {
    return _resolveCanonicalAppliedSchemaVersion(
      tableName,
      systemTableCache,
    );
  }

  /**
   * Extract required schema version candidate from bootstrap snapshot scope.
   * @param {string} tableName
   * @return {string|null}
   * @private
   */
  extractCanonicalSnapshotSchemaVersion(tableName) {
    return _extractCanonicalSnapshotSchemaVersion(
      this.bootstrapResponse?.systemTableSnapshots,
      tableName,
    );
  }

  /**
   * Extract schema version candidate from local cache rows for one table.
   * @param {Object|null} systemTableCache
   * @param {string} tableName
   * @return {string|null}
   * @private
   */
  extractCanonicalCacheSchemaVersion(systemTableCache, tableName) {
    return _extractCanonicalCacheSchemaVersion(
      systemTableCache,
      tableName,
    );
  }

  /**
   * Extract schema version candidate from `tables` metadata row.
   * @param {Object|null} systemTableCache
   * @param {string} tableName
   * @return {string|null}
   * @private
   */
  extractCanonicalTableMetadataSchemaVersion(
    systemTableCache,
    tableName,
  ) {
    return _extractCanonicalTableMetadataSchemaVersion(
      systemTableCache,
      tableName,
    );
  }

  /**
   * Extract one schema-version candidate from a record.
   * @param {Object} record
   * @return {string|null}
   * @private
   */
  extractJoinSchemaVersionFromRecord(record) {
    return _extractJoinSchemaVersionFromRecord(record);
  }

  /**
   * Keep the newest schema-version watermark.
   * @param {string|null} current
   * @param {string|null} candidate
   * @return {string|null}
   * @private
   */
  selectNewestJoinSchemaVersion(current, candidate) {
    return _selectNewestJoinSchemaVersion(current, candidate);
  }

  /**
   * Normalize a schema-version value to canonical string representation.
   * @param {*} value
   * @return {string|null}
   * @private
   */
  normalizeJoinSchemaVersion(value) {
    return _normalizeJoinSchemaVersion(value);
  }

  /**
   * Compare schema versions supporting HLC and numeric fallback.
   * @param {string} left
   * @param {string} right
   * @return {number}
   * @private
   */
  compareJoinSchemaVersions(left, right) {
    return _compareJoinSchemaVersions(left, right);
  }

  /**
   * Parse HLC-like schema version.
   * @param {string} value
   * @return {{physical: number, logical: number, nodeId: string}|null}
   * @private
   */
  tryParseJoinSchemaHlc(value) {
    return _tryParseJoinSchemaHlc(value);
  }

  /**
   * Activate non-critical periodic control-plane writers once the joining
   * node reaches READY.
   * @return {void}
   * @private
   */
  activateControlPlaneBackgroundWriters() {
    if (this.controlPlaneBackgroundWritersActivated) {
      return;
    }

    if (this.leaseService) {
      this.leaseService.start();
    }

    if (this.heartbeatService && this.controlPlaneHeartbeatStartOptions) {
      this.heartbeatService.start(this.controlPlaneHeartbeatStartOptions);
    }

    this.controlPlaneBackgroundWritersActivated = true;
    this.logger.info(JOINING_LOG_MSG.CONTROL_PLANE_BACKGROUND_WRITERS_ACTIVE, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Execute a joining phase with logging and timing.
   * @param {string} phaseName - Phase name.
   * @param {Function} phaseFunction - Phase implementation function.
   * @return {Promise<void>}
   * @private
   */
  async executePhase(phaseName, phaseFunction) {
    this.phase = phaseName;
    this.phaseStartTime = this.now();

    this.logger.info(JOINING_LOG_MSG.PHASE_STARTING, {
      nodeId: this.nodeId,
      phase: phaseName,
    });

    this.emit(JoiningEvent.PHASE_START, {
      phase: phaseName,
      nodeId: this.nodeId,
    });

    try {
      await this.workClassScheduler.enqueue(WORK_CLASS.A, async () => {
        await phaseFunction();
      });

      const phaseDuration = this.now() - this.phaseStartTime;

      this.logger.info(JOINING_LOG_MSG.PHASE_COMPLETED, {
        nodeId: this.nodeId,
        phase: phaseName,
        duration: phaseDuration,
      });

      this.emit(JoiningEvent.PHASE_COMPLETE, {
        phase: phaseName,
        nodeId: this.nodeId,
        duration: phaseDuration,
      });
    } catch (error) {
      const phaseDuration = this.now() - this.phaseStartTime;

      this.logger.error(JOINING_LOG_MSG.PHASE_FAILED, {
        nodeId: this.nodeId,
        phase: phaseName,
        duration: phaseDuration,
        error: error.message,
        stack: error.stack,
      });

      this.emit(JoiningEvent.PHASE_FAILED, {
        phase: phaseName,
        nodeId: this.nodeId,
        duration: phaseDuration,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Phase 1: Contact seed node via HTTP.
   * @return {Promise<void>}
   * @private
   */
  async phaseContactSeed() {
    return this.contactSeedPhase.phaseContactSeed();
  }

  /**
   * Resolve bounded retry policy for join-time HTTP operations.
   * @return {Object}
   * @private
   */
  resolveJoinRetryPolicy() {
    return this.contactSeedPhase.resolveJoinRetryPolicy();
  }

  /**
   * Classify one seed contact failure for retry/backoff behavior.
   * @param {Error} error
   * @param {string} retryableTimeoutErrorMessage
   * @return {Object}
   * @private
   */
  classifySeedContactFailure(error, retryableTimeoutErrorMessage) {
    return this.contactSeedPhase
      .classifySeedContactFailure(error, retryableTimeoutErrorMessage);
  }

  /**
   * Compute retry delay using bootstrap hints + bounded jitter.
   * @param {Object} options
   * @param {number} options.baseDelayMs
   * @param {number} options.maxDelayMs
   * @param {number|null} options.retryAfterMs
   * @return {number}
   * @private
   */
  computeSeedContactRetryDelayMs(options = {}) {
    return this.contactSeedPhase
      .computeSeedContactRetryDelayMs(options);
  }

  /**
   * Apply bounded symmetric jitter to one retry delay.
   * @param {number} delayMs
   * @param {number} maxDelayMs
   * @return {number}
   * @private
   */
  applySeedContactRetryJitter(delayMs, maxDelayMs) {
    return this.contactSeedPhase
      .applySeedContactRetryJitter(delayMs, maxDelayMs);
  }

  /**
   * Resolve retry hint (ms) from parsed body and transport metadata.
   * @param {Error} error
   * @param {Object|null} parsedError
   * @return {number|null}
   * @private
   */
  resolveSeedContactRetryAfterMs(error, parsedError) {
    return _resolveSeedContactRetryAfterMs(error, parsedError);
  }

  /**
   * Parse bootstrap HTTP error bodies from the default HTTP client.
   * @param {Error} error
   * @return {Object|null}
   * @private
   */
  parseBootstrapError(error) {
    return _parseBootstrapError(error);
  }

  /**
   * Build a consistent error message for bootstrap failures.
   * @param {Object} response
   * @return {string}
   * @private
   */
  buildBootstrapFailureError(response) {
    return this.contactSeedPhase
      .buildBootstrapFailureError(response);
  }

  /**
   * Format leader metadata details for error reporting.
   * @param {Object} details
   * @return {string}
   * @private
   */
  formatLeaderMetadataDetails(details) {
    return _formatLeaderMetadataDetails(details);
  }

  /**
   * Build a canonical descriptor for join-managed unified lifecycle replicas.
   * @param {string} serviceType
   * @param {string} serviceId
   * @return {Object}
   * @private
   */
  createJoinServiceDescriptor(serviceType, serviceId) {
    return {
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: serviceType,
      [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: this.nodeId,
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: NUM.ONE,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND]:
        JOINING_UNIFIED_RECONCILE.RUNTIME_KIND,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_REF]: null,
      [SERVICE_DESCRIPTOR_FIELD.RUNTIME_CONFIG]: null,
    };
  }

  /**
   * Queue one join replica for desired-state reconciliation.
   * @param {Object} descriptor
   * @param {Object} options
   * @return {void}
   * @private
   */
  queueJoinServiceReplica(descriptor, options) {
    const serviceId = descriptor[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    this.joinDesiredServiceDefinitions.set(serviceId, descriptor);
    this.joinReplicaOptionsByServiceId.set(serviceId, options);
  }

  /**
   * Resolve join replica options for one serviceId.
   * @param {string} serviceId
   * @param {string} serviceType
   * @return {Object}
   * @private
   */
  resolveJoinReplicaOptions(serviceId, serviceType) {
    const options = this.joinReplicaOptionsByServiceId.get(serviceId) || null;
    assertCritical(options, `Missing join replica options for ${serviceId}`);
    assertCritical(
      options.serviceType === serviceType,
      `Join replica type mismatch for ${serviceId}: expected ${serviceType}`,
    );
    return options;
  }

  /**
   * Build local actual-state rows for join reconciliation.
   * @return {Object[]}
   * @private
   */
  buildJoinActualStateRows() {
    if (!this.serviceLifecycleManager) {
      return [];
    }

    const rows = [];
    for (const replicaId of this.messageGroupServices.keys()) {
      const handle = this.createJoinServiceDescriptor(
        UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
        replicaId,
      );
      rows.push({
        ...handle,
        [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
          this.serviceLifecycleManager.getReplicaState(handle),
      });
    }

    return rows;
  }

  /**
   * Initialize unified lifecycle owners for join-time service startup.
   * @return {Promise<void>}
   * @private
   */
  async initializeJoiningLifecycleOwners() {
    if (this.serviceLifecycleManager && this.serviceReconciler) {
      return;
    }

    this.serviceLifecycleManager = new ServiceLifecycleManager();
    this.serviceLifecycleManager.registerAdapter(
      new MessageGroupServiceAdapter({
        createReplica: (context) => this.createJoinMessageGroupReplica(context),
        startReplica: (replicaHandle, context) =>
          this.startJoinMessageGroupReplica(replicaHandle, context),
        stopReplica: (replicaHandle, context) =>
          this.stopJoinMessageGroupReplica(replicaHandle, context),
      }),
    );
    this.serviceLifecycleManager.registerAdapter(
      new RuntimeServiceAdapter({
        serviceRuntimeLifecycle: this.serviceRuntimeLifecycle,
      }),
    );

    this.serviceReconciler = new ServiceReconciler({
      lifecycleManager: this.serviceLifecycleManager,
      desiredStateReader: async () => [...this.joinDesiredServiceDefinitions.values()],
      actualStateReader: async () => this.buildJoinActualStateRows(),
      checkIntervalMs: JOINING_UNIFIED_RECONCILE.CHECK_INTERVAL_MS,
    });
    await this.serviceReconciler.start();
  }

  /**
   * Trigger one join reconciliation cycle.
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async triggerJoinReconciler(reason) {
    assertCritical(
      this.serviceReconciler,
      'Join reconciler must be initialized before reconciliation',
    );
    await this.serviceReconciler.trigger(reason, {
      nodeId: this.nodeId,
      phase: this.phase,
    });
  }

  /**
   * Stop unified lifecycle owners and clear join desired-state catalogs.
   * @return {void}
   * @private
   */
  stopJoiningLifecycleOwners() {
    if (this.serviceReconciler) {
      this.serviceReconciler.stop();
      this.serviceReconciler = null;
    }
    this.serviceLifecycleManager = null;
    this.joinDesiredServiceDefinitions.clear();
    this.joinReplicaOptionsByServiceId.clear();
    this.joinMessageGroupReplicas = [];
  }

  /**
   * Unified lifecycle create hook for join message-group replicas.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async createJoinMessageGroupReplica(context) {
    return this.createMessageGroupPhase
      .createJoinMessageGroupReplica(context);
  }

  /**
   * Unified lifecycle start hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async startJoinMessageGroupReplica(replicaHandle, _context) {
    return this.createMessageGroupPhase
      .startJoinMessageGroupReplica(
        replicaHandle,
        _context,
      );
  }

  /**
   * Unified lifecycle stop hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async stopJoinMessageGroupReplica(replicaHandle, _context) {
    return this.createMessageGroupPhase
      .stopJoinMessageGroupReplica(
        replicaHandle,
        _context,
      );
  }

  /**
   * Compatibility shim for deferred self-hosted join elections.
   * Replica create/start ownership remains in unified lifecycle adapters.
   * @param {string} groupId - Message group ID.
   * @return {void}
   * @private
   */
  startDeferredJoinMessageGroupElections(groupId) {
    return this.createMessageGroupPhase
      .startDeferredJoinMessageGroupElections(groupId);
  }

  /**
   * Phase 3a: Create self-hosted message group (3 replicas on this node).
   * Requirements: 8.3 - Services created AFTER self-connection established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async phaseCreateSelfHostedMessageGroup(assignment) {
    return this.createMessageGroupPhase
      .phaseCreateSelfHostedMessageGroup(assignment);
  }

  /**
   * Get the leader message group service for sending lifecycle messages.
   * Returns the first leader, or a replica that has a known leader.
   * @return {Object|null} Message group service or null.
   * @private
   */
  getLeaderMessageGroupService() {
    // First try to find a leader
    for (const service of this.messageGroupServices.values()) {
      if (service && service.isLeaderReplica && service.isLeaderReplica()) {
        return service;
      }
    }

    // Fall back to any replica that knows the leader
    for (const service of this.messageGroupServices.values()) {
      if (service && typeof service.getLeaderId === TYPEOF.FUNCTION &&
          service.getLeaderId()) {
        return service;
      }
    }
    // Fall back to any local message group service if leadership metadata is delayed
    for (const service of this.messageGroupServices.values()) {
      if (service) {
        return service;
      }
    }
    return null;
  }

  /**
   * Resolve the message-group service to use for partition CDC propagation.
   * Prefers the current local leader when available and falls back to
   * the captured message-group service.
   * @param {Object|null} preferredMessageGroupService
   * @return {Object|null}
   */
  resolveCdcPropagationMessageGroup(preferredMessageGroupService) {
    const leaderMessageGroupService = this.getLeaderMessageGroupService();
    if (leaderMessageGroupService) {
      return leaderMessageGroupService;
    }
    return preferredMessageGroupService || null;
  }

  /**
   * Enforce single-owner invariant before starting a local message-group replica.
   * Unauthorized duplicate startup must fail fast.
   * @param {string} replicaId
   * @return {void}
   * @private
   */
  assertReplicaStartupOwnership(replicaId) {
    return this.joinMessageGroupPhase
      .assertReplicaStartupOwnership(replicaId);
  }

  /**
   * Phase 3b: Join existing message group by moving a replica.
   * Requirements: 8.3 - Services created AFTER self-connection established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async phaseJoinExistingMessageGroup(assignment) {
    return this.joinMessageGroupPhase
      .phaseJoinExistingMessageGroup(assignment);
  }

  /**
   * Register a message group service in the cluster's services table.
   * This ensures other nodes can discover this replica.
   * @param {string} groupId - Message group ID.
   * @param {string} replicaId - Replica ID.
   * @param {MessageGroupService} service - The message group service.
   * @return {Promise<void>}
   * @private
   */
  async registerMessageGroupService(groupId, replicaId, service) {
    return this.createMessageGroupPhase
      .registerMessageGroupService(
        groupId,
        replicaId,
        service,
      );
  }

  /**
   * Persist metadata required for CREATE_SELF_HOSTED joins.
   * Ensures message_groups and per-replica services rows are present before
   * join can complete successfully.
   * @return {Promise<void>}
   * @private
   */
  async registerCreateSelfHostedMetadata() {
    return this.createMessageGroupPhase
      .registerCreateSelfHostedMetadata();
  }

  /**
   * Phase 3: Wait for message group leadership establishment.
   * @return {Promise<void>}
   * @private
   */
  async phaseWaitForLeadership() {
    return this.waitForLeadershipPhase
      .phaseWaitForLeadership();
  }

  /**
   * Wait for system table leaders to be present in cache before seeding writes.
   * Delegates to WaitForLeadershipPhase.
   * @param {Object} systemTableCache - System table cache.
   * @return {Promise<void>}
   * @private
   */
  async waitForSystemServiceLeaders(systemTableCache) {
    return this.waitForLeadershipPhase
      .waitForSystemServiceLeaders(systemTableCache);
  }

  /**
   * Get the system tables that must be write-routable before state-query writes.
   * Delegates to WaitForLeadershipPhase.
   * @return {Array<string>} Required system table names.
   * @private
   */
  getRequiredSystemWriteTables() {
    return this.waitForLeadershipPhase
      .getRequiredSystemWriteTables();
  }

  /**
   * Check whether a system table is currently write-routable for join workflow.
   * Delegates to WaitForLeadershipPhase.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @return {boolean} True when writes can be routed.
   * @private
   */
  isSystemTableWriteRoutable(systemTableCache, tableName) {
    return this.waitForLeadershipPhase
      .isSystemTableWriteRoutable(systemTableCache, tableName);
  }

  /**
   * Check whether the cache currently includes a partition row for a table.
   * Delegates to WaitForLeadershipPhase.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @return {boolean} True when table partition is present in cache.
   * @private
   */
  hasSystemTablePartition(systemTableCache, tableName) {
    return this.waitForLeadershipPhase
      .hasSystemTablePartition(systemTableCache, tableName);
  }

  /**
   * Find missing service leaders using system table cache.
   * Delegates to WaitForLeadershipPhase.
   * @param {Object} systemTableCache - System table cache.
   * @return {Object} Missing leader lists.
   * @private
   */
  getMissingSystemServiceLeaders(systemTableCache) {
    return this.waitForLeadershipPhase
      .getMissingSystemServiceLeaders(systemTableCache);
  }

  /**
   * Keep join-time readiness gates focused on system-table write routing.
   * Delegates to WaitForLeadershipPhase.
   * @param {Object} missing - Missing leader diagnostics.
   * @param {Object} systemTableCache - System table cache.
   * @return {Object} Blocking subset for state-query readiness.
   * @private
   */
  getBlockingSystemServiceLeaders(missing, systemTableCache) {
    return this.waitForLeadershipPhase
      .getBlockingSystemServiceLeaders(missing, systemTableCache);
  }

  /**
   * Build bootstrap payload for IDENTIFY message.
   * @return {Object|null} Identify bootstrap payload.
   * @private
   */
  getIdentifyBootstrapPayload() {
    if (!this.bootstrapResponse) {
      return null;
    }

    return {
      seedNodeId: this.seedNodeId,
      seedNodeWsAddress: this.seedNodeWsAddress,
      messageGroupAssignment: this.bootstrapResponse.messageGroupAssignment,
      partitionLeaders: this.bootstrapResponse.partitionLeaders,
      latencyTopologyHints: this.bootstrapResponse.latencyTopologyHints,
      clusterConfig: this.bootstrapResponse.clusterConfig,
      timestamp: this.bootstrapResponse.timestamp,
    };
  }

  /**
   * Get the default node capabilities for control plane registration.
   * @return {Array<string>} Capabilities list.
   * @private
   */
  getNodeCapabilities() {
    return [...DEFAULT_NODE_CAPABILITIES];
  }

  /**
   * Resolve the control plane message target address.
   * Prefer authoritative services-table metadata. Bootstrap peer hints are
   * used only when authoritative metadata is not yet available.
   * @param {Object} [options] - Resolution options.
   * @param {boolean} [options.allowBootstrapHints=true] - Allow hint fallback.
   * @return {string|null} Target address or null.
   * @private
   */
  resolveControlPlaneTargetAddress(options = {}) {
    const allowBootstrapHints = options.allowBootstrapHints !== false;
    const assignment = this.bootstrapResponse?.messageGroupAssignment;
    if (!assignment) {
      return null;
    }

    const authoritativeTarget =
      this.resolveControlPlaneTargetAddressFromServices(assignment);
    if (authoritativeTarget) {
      return authoritativeTarget;
    }

    if (!allowBootstrapHints) {
      return null;
    }

    return this.resolveControlPlaneTargetAddressFromBootstrapHints(assignment);
  }

  /**
   * Resolve control-plane target using authoritative services metadata.
   * @param {Object} assignment - Bootstrap message group assignment.
   * @return {string|null} Routable address or null.
   * @private
   */
  resolveControlPlaneTargetAddressFromServices(assignment) {
    const groupId = assignment?.groupId;
    if (!groupId) {
      return null;
    }

    let cache = null;
    const nodeService = NodeService.getInstance();
    if (nodeService && typeof nodeService.getSystemTableCache === TYPEOF.FUNCTION) {
      cache = nodeService.getSystemTableCache();
    }
    if (!cache || typeof cache.filter !== TYPEOF.FUNCTION) {
      return null;
    }

    const seedNodeId = this.bootstrapResponse?.seedNodeId || this.seedNodeId;
    const replicaToMove = assignment.replicaToMove || null;
    const hasConnectionState = this.messageRouter &&
      typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION;
    const isConnectedNode = (nodeId) => {
      if (!nodeId) {
        return false;
      }
      if (nodeId === this.nodeId) {
        return true;
      }
      if (!hasConnectionState) {
        return true;
      }
      return this.messageRouter.getConnectionState(nodeId) === STATE.CONNECTED;
    };

    return resolveMessageGroupTargetAddressFromCache(cache, groupId, {
      excludeServiceId: replicaToMove,
      seedNodeId,
      isConnectedNode,
    });
  }

  /**
   * Resolve control-plane target from bootstrap hint addresses.
   * @param {Object} assignment - Bootstrap message group assignment.
   * @return {string|null} Hint address or null.
   * @private
   */
  resolveControlPlaneTargetAddressFromBootstrapHints(assignment) {
    // The control-plane target must be *reachable* from a joining node.
    // During joins we typically only have a direct WS connection to the seed node.
    //
    // If we naively pick the first peer address, we may pick a replica that is being moved
    // off the seed node (MOVE_REPLICA), making the target unreachable for subsequent joins.
    //
    // Strategy:
    // 1) Prefer a message-group replica that is hosted on the seed node and is *not* the
    //    replica being moved as part of this join.
    // 2) Fall back to any non-moved replica address.
    const seedNodeId = this.bootstrapResponse?.seedNodeId || this.seedNodeId;
    const replicaToMove = assignment.replicaToMove || null;

    const hintCandidates = [
      ...(Array.isArray(assignment.peerAddresses) ? assignment.peerAddresses : []),
      ...(Array.isArray(assignment.replicaAddresses) ? assignment.replicaAddresses : []),
    ].filter(Boolean);

    const parseAddress = (addr) => {
      const m = addr.match(/^([^/]+)\/message-group\/(.+)$/);
      return m ? {nodeId: m[NUM.ONE], replicaId: m[NUM.TWO]} : null;
    };

    const prefer = hintCandidates.find((addr) => {
      const parsed = parseAddress(addr);
      if (!parsed) return false;
      if (seedNodeId && parsed.nodeId !== seedNodeId) return false;
      if (replicaToMove && parsed.replicaId === replicaToMove) return false;
      return true;
    });
    if (prefer) return prefer;

    const nextBest = hintCandidates.find((addr) => {
      const parsed = parseAddress(addr);
      if (!parsed) return false;
      if (replicaToMove && parsed.replicaId === replicaToMove) return false;
      return true;
    });
    if (nextBest) return nextBest;

    if (assignment.strategy === AssignmentStrategy.CREATE_SELF_HOSTED) {
      const localLeader = this.getLeaderMessageGroupService();
      if (localLeader?.unifiedAddress) {
        return localLeader.unifiedAddress;
      }
      for (const service of this.messageGroupServices.values()) {
        if (service?.unifiedAddress) {
          return service.unifiedAddress;
        }
      }
      return null;
    }

    throw new Error(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING);
  }

  /**
   * Send a NODE_STATE_UPDATE control-plane message through the current
   * authoritative target address.
   * @param {Object} options - Node state payload.
   * @param {string} options.state - Node connection state.
   * @param {Array<string>|string} [options.capabilities] - Node capabilities.
   * @param {number} [options.heartbeatAt] - Heartbeat timestamp.
   * @param {number} [options.readyLeaseExpiresAt] - Lease expiry timestamp.
   * @param {Object} [options.nodeRow] - Full node row payload.
   * @return {Promise<void>}
   * @private
   */
  async sendControlPlaneNodeStateUpdate(options = {}) {
    const state = options.state;
    if (!state) {
      return;
    }

    this.triggerBackgroundClusterMeshReconciliation(state);

    const targetAddress =
      this.resolveControlPlaneTargetAddress({allowBootstrapHints: false}) ||
      this.resolveControlPlaneTargetAddress({allowBootstrapHints: true});
    if (!targetAddress) {
      this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_TARGET_MISSING, {
        nodeId: this.nodeId,
        state,
      });
      throw new Error(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING);
    }

    if (this.controlPlaneTargetAddress &&
        this.controlPlaneTargetAddress !== targetAddress) {
      this.logger.info(JOINING_LOG_MSG.CONTROL_PLANE_TARGET_UPDATED, {
        nodeId: this.nodeId,
        previousTargetAddress: this.controlPlaneTargetAddress,
        targetAddress,
        state,
      });
    }
    this.controlPlaneTargetAddress = targetAddress;

    const message = {
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: this.nodeId,
      [ControlPlaneField.NODE_ADDRESS]: this.nodeAddress,
      [ControlPlaneField.CAPABILITIES]:
        options.capabilities ?? this.getNodeCapabilities(),
      [ControlPlaneField.STATE]: state,
    };
    if (Number.isFinite(options.heartbeatAt)) {
      message[ControlPlaneField.HEARTBEAT_AT] = options.heartbeatAt;
    }
    if (Number.isFinite(options.readyLeaseExpiresAt)) {
      message[ControlPlaneField.READY_LEASE_EXPIRES_AT] =
        options.readyLeaseExpiresAt;
    }
    if (options.nodeRow && typeof options.nodeRow === 'object') {
      message[ControlPlaneField.NODE_ROW] = options.nodeRow;
    }

    try {
      const deliveryResult = await this.messageRouter.deliver(
        targetAddress,
        message,
      );
      if (deliveryResult?.acknowledged !== true) {
        throw new Error(
          deliveryResult?.error || 'control-plane message was not acknowledged',
        );
      }
      this.logger.info(JOINING_LOG_MSG.NODE_STATE_UPDATE_SENT, {
        nodeId: this.nodeId,
        targetAddress,
        state,
      });
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.NODE_STATE_UPDATE_FAILED, {
        nodeId: this.nodeId,
        targetAddress,
        state,
        error: error.message,
      });
      throw new Error(JOINING_ERROR_MSG.controlPlaneMessageFailed(error.message));
    }
  }

  /**
   * Reconcile peer mesh connectivity without blocking the READY heartbeat path.
   * Heartbeats are a liveness signal and should not wait on best-effort
   * background connection maintenance.
   * @param {string} state - Node connection state being reported.
   * @return {void}
   * @private
   */
  triggerBackgroundClusterMeshReconciliation(state) {
    if (state !== STATE.READY ||
        !this.messageRouter ||
        !this.shouldReconnectClusterMesh()) {
      return;
    }

    if (this.pendingClusterMeshReconciliation) {
      return;
    }

    const reconciliation = Promise.resolve()
      .then(() => this.connectToClusterNodes())
      .catch((error) => {
        this.logger.warn(
          'Failed to reconcile cluster mesh during READY NODE_STATE_UPDATE',
          {
            nodeId: this.nodeId,
            state,
            error: error.message,
          },
        );
      })
      .finally(() => {
        if (this.pendingClusterMeshReconciliation === reconciliation) {
          this.pendingClusterMeshReconciliation = null;
        }
      });

    this.pendingClusterMeshReconciliation = reconciliation;
  }

  /**
   * Phase 2: Connect to seed node via WebSocket for cross-node communication.
   * Requirements: 8.1, 8.2, 8.3, 8.4 - Bootstrap sequence: server → self-connect → services.
   * @return {Promise<void>}
   * @private
   */
  async phaseConnectWebSocket() {
    return this.connectWebSocketPhase.phaseConnectWebSocket();
  }

  /**
   * Connect to all cluster nodes for full mesh connectivity.
   * Skips nodes we're already connected to (checked via messageRouter).
   * All nodes are equal peers - no special treatment for any node.
   * @return {Promise<void>}
   * @private
   */
  async connectToClusterNodes() {
    return this.connectWebSocketPhase.connectToClusterNodes();
  }

  /**
   * Derive WebSocket address from node REST address.
   * @param {string} nodeAddress - Node address in format "hostname:port".
   * @return {string|null} WebSocket address or null if cannot derive.
   * @private
   */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    return _deriveWsAddressFromNodeAddress(nodeAddress);
  }

  /**
   * Hydrate system cache from bootstrap response snapshots.
   * Delegates to QuerySystemStatePhase.
   * @return {Promise<void>}
   * @private
   */
  async hydrateSystemCacheFromBootstrap() {
    return this.querySystemStatePhase
      .hydrateSystemCacheFromBootstrap();
  }

  /**
   * Resolve the cache operation for a bootstrap snapshot record.
   * Delegates to QuerySystemStatePhase.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @param {Object} record - Snapshot row.
   * @return {string|null} CDC operation or null when row should be skipped.
   * @private
   */
  getSnapshotHydrationOperation(systemTableCache, tableName, record) {
    return this.querySystemStatePhase
      .getSnapshotHydrationOperation(
        systemTableCache,
        tableName,
        record,
      );
  }

  /**
   * Phase 5: Query system partitions for cluster state and register this node.
   * Delegates to QuerySystemStatePhase.
   * @return {Promise<void>}
   * @private
   */
  async phaseQuerySystemState() {
    return this.querySystemStatePhase.phaseQuerySystemState();
  }

  /**
   * Register this node in the cluster's nodes table.
   * Delegates to QuerySystemStatePhase.
   * @return {Promise<void>}
   * @private
   */
  async registerNodeInCluster() {
    return this.querySystemStatePhase.registerNodeInCluster();
  }

  /**
   * Register the WebSocket endpoint for this node.
   * Delegates to QuerySystemStatePhase.
   * @param {number} now - Current timestamp.
   * @return {Promise<Object>}
   * @private
   */
  async registerNodeEndpoint(now) {
    return this.querySystemStatePhase
      .registerNodeEndpoint(now);
  }

  /**
   * Register built-in meta service endpoints for this joining node.
   * Delegates to QuerySystemStatePhase.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async registerMetaServiceEndpoints() {
    return this.querySystemStatePhase
      .registerMetaServiceEndpoints();
  }

  /**
   * Upsert a system-table row through CDC integration service.
   * Delegates to QuerySystemStatePhase.
   * @param {string} tableName - System table name.
   * @param {Object} rowData - Row payload.
   * @return {Promise<Object>} Upsert result.
   * @private
   */
  async upsertSystemTableRow(tableName, rowData) {
    return this.querySystemStatePhase
      .upsertSystemTableRow(tableName, rowData);
  }

  /**
   * Determine whether join-time upserts can require local cache visibility.
   * Delegates to QuerySystemStatePhase.
   * @return {Object|undefined}
   * @private
   */
  getJoinTimeUpsertOptions() {
    return this.querySystemStatePhase
      .getJoinTimeUpsertOptions();
  }

  /**
   * Seed successful join-time control-plane writes into the local cache.
   * Delegates to QuerySystemStatePhase.
   * @param {string} tableName
   * @param {Object|null} rowData
   * @return {void}
   * @private
   */
  seedJoinTimeCacheRow(tableName, rowData) {
    return this.querySystemStatePhase
      .seedJoinTimeCacheRow(tableName, rowData);
  }

  /**
   * Subscribe to CDC events for default cache-sync tables.
   * This keeps the system cache updated as cluster state changes.
   * Requirements: 4.1, 4.2, 4.3 - CDC subscriptions keep cache updated.
   * @return {Promise<void>}
   * @private
   */
  async subscribeToCDCEvents() {
    if (!this.cdcIntegrationService) {
      const error = new Error(
        JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
          'default cache-sync tables',
          'CDC integration service not available',
        ),
      );
      this.logger.error(JOINING_LOG_MSG.CDC_SUBSCRIPTION_FAILED, {
        nodeId: this.nodeId,
        error: error.message,
      });
      throw error;
    }

    const systemTables = CACHE_HYDRATION_TABLES;

    this.logger.info(JOINING_LOG_MSG.CDC_INTEGRATION_CREATE, {
      nodeId: this.nodeId,
      tables: systemTables,
    });

    try {
      // Subscribe to all CDC events (insert, update, delete, upsert)
      // The CDCIntegrationService emits these events when system tables change
      // The system cache is automatically updated by the cache hydration service
      const cdcEventHandler = (event) => {
        this.logger.debug(JOINING_LOG_MSG.CDC_EVENT_RECEIVED, {
          nodeId: this.nodeId,
          tableName: event.tableName,
          operation: event.operation || STRING.UNKNOWN,
        });
      };

      // Subscribe to each event type using constants
      const eventTypes = [
        CDC_EVENT.INSERT,
        CDC_EVENT.UPDATE,
        CDC_EVENT.DELETE,
        CDC_EVENT.UPSERT,
      ];
      for (const eventType of eventTypes) {
        this.cdcIntegrationService.on(eventType, cdcEventHandler);
      }

      // Verify subscriptions are active by checking listener count
      const subscriptionStatus = {};
      for (const eventType of eventTypes) {
        const listenerCount = this.cdcIntegrationService.listenerCount(eventType);
        subscriptionStatus[eventType] = listenerCount;

        if (listenerCount === NUM.ZERO) {
          throw new Error(
            `CDC subscription verification failed: no listeners for ${eventType}`,
          );
        }
      }

      this.logger.info(JOINING_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
        nodeId: this.nodeId,
        eventTypes,
        tableCount: systemTables.length,
        subscriptionStatus,
      });

      // Mark CDC subscriptions as active
      this.cdcSubscriptionsActive = true;
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.CDC_SUBSCRIPTION_FAILED, {
        nodeId: this.nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Backfill propagated cache tables from authoritative routed reads.
   *
   * This closes the blind window between the initial bootstrap snapshot and
   * the moment CDC subscriptions become active, during which discovery rows
   * written by concurrently joining peers could otherwise be missed forever.
   *
   * @return {Promise<void>}
   * @private
   */
  async backfillPropagatedCacheTablesFromAuthoritativeState(
    tableNames = CACHE_HYDRATION_TABLES,
  ) {
    const sqlQueryEngine = assertCritical(
      this.cdcIntegrationService?.sqlQueryEngine,
      JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED,
    );
    const systemTableCache = assertCritical(
      NodeService.getInstance().getSystemTableCache(),
      JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED,
    );
    const propagatedTables = Array.isArray(tableNames) &&
      tableNames.length > NUM.ZERO ?
      [...new Set(tableNames)] :
      CACHE_HYDRATION_TABLES;

    let totalRowsApplied = NUM.ZERO;
    const tableRowCounts = {};

    for (const tableName of propagatedTables) {
      const rows = await this.resolveAuthoritativeBackfillRows(
        sqlQueryEngine,
        tableName,
      );
      tableRowCounts[tableName] = rows.length;
      for (const row of rows) {
        const operation = this.getSnapshotHydrationOperation(
          systemTableCache,
          tableName,
          row,
        );
        if (!operation) {
          continue;
        }
        systemTableCache.applySystemTableChange(tableName, operation, row);
        totalRowsApplied += NUM.ONE;
      }
    }

    this.logger.info('Backfilled propagated cache tables from authoritative state', {
      nodeId: this.nodeId,
      tableCount: propagatedTables.length,
      totalRowsApplied,
      tableRowCounts,
    });
  }

  /**
   * Resolve one propagated-table snapshot for join backfill.
   * Merges routed SQL reads with direct replica fanout so a stale replica
   * cannot silently hide rows during a multi-node join burst.
   * @param {Object} sqlQueryEngine
   * @param {string} tableName
   * @return {Promise<Object[]>}
   * @private
   */
  async resolveAuthoritativeBackfillRows(sqlQueryEngine, tableName) {
    const sql = `SELECT * FROM ${tableName}`;
    const rowSets = [];
    const bootstrapSnapshotRows = Array.isArray(
      this.bootstrapResponse?.systemTableSnapshots?.[tableName],
    ) ?
      this.bootstrapResponse.systemTableSnapshots[tableName] :
      [];
    if (bootstrapSnapshotRows.length > NUM.ZERO) {
      rowSets.push(bootstrapSnapshotRows);
    }
    const routedResult = await sqlQueryEngine.executeQuery(sql);
    if (routedResult?.success) {
      rowSets.push(Array.isArray(routedResult.rows) ? routedResult.rows : []);
    }

    const replicaQuery = await this.queryBackfillRowsAcrossReplicas(
      sqlQueryEngine,
      tableName,
      sql,
    );
    if (replicaQuery && replicaQuery.rowSets.length > 0) {
      rowSets.push(...replicaQuery.rowSets);
      const observedCounts = replicaQuery.rowSets.map((rows) => rows.length);
      const mergedCount = this.mergeBackfillRowSets(tableName, replicaQuery.rowSets).length;
      const minReplicaCount = Math.min(...observedCounts);
      const maxReplicaCount = Math.max(...observedCounts);
      if (minReplicaCount !== maxReplicaCount || mergedCount > maxReplicaCount) {
        this.logger.warn('Join backfill detected replica divergence', {
          nodeId: this.nodeId,
          tableName,
          partitionId: replicaQuery.partitionId,
          replicaCount: replicaQuery.rowSets.length,
          observedCounts,
          mergedCount,
        });
      }
    }

    if (rowSets.length === NUM.ZERO) {
      throw new Error(
        `Failed to backfill propagated table ${tableName}: ` +
        `${routedResult?.error || 'query failed'}`,
      );
    }

    return this.mergeBackfillRowSets(tableName, rowSets);
  }

  /**
   * Query all known routable replicas for one propagated table and return
   * successful row sets. This is used only during join-time cache repair.
   * @param {Object} sqlQueryEngine
   * @param {string} tableName
   * @param {string} sql
   * @return {Promise<{partitionId: string, rowSets: Object[][]}|null>}
   * @private
   */
  async queryBackfillRowsAcrossReplicas(sqlQueryEngine, tableName, sql) {
    const partitions =
      typeof sqlQueryEngine?.getTablePartitions === TYPEOF.FUNCTION ?
        sqlQueryEngine.getTablePartitions(tableName) :
        [];
    if (!Array.isArray(partitions) || partitions.length !== NUM.ONE) {
      return null;
    }

    const partitionId =
      partitions[0]?.partition_id || partitions[0]?.partitionId || null;
    if (!partitionId) {
      return null;
    }

    const queryExecutor = sqlQueryEngine?.queryExecutor || null;
    const partitionServices =
      typeof queryExecutor?.getRoutablePartitionServices === TYPEOF.FUNCTION ?
        queryExecutor.getRoutablePartitionServices(partitionId) :
        [];
    if (!Array.isArray(partitionServices) || partitionServices.length === NUM.ZERO) {
      return null;
    }

    const seenAddresses = new Set();
    const deliveryTargets = [];
    for (const service of partitionServices) {
      const address = service?.address || null;
      if (typeof address !== TYPEOF.STRING || address.length === NUM.ZERO ||
          seenAddresses.has(address)) {
        continue;
      }
      seenAddresses.add(address);
      deliveryTargets.push(address);
    }
    if (deliveryTargets.length === NUM.ZERO) {
      return null;
    }

    const messageRouter =
      queryExecutor?.messageRouter || this.messageRouter || null;
    if (!messageRouter || typeof messageRouter.deliver !== TYPEOF.FUNCTION) {
      return null;
    }

    const replicaResults = await Promise.all(deliveryTargets.map((address) =>
      this.queryBackfillReplicaAddress(messageRouter, address, sql),
    ));
    const rowSets = replicaResults
      .filter((result) => result.success)
      .map((result) => result.rows);

    return rowSets.length > NUM.ZERO ?
      {partitionId, rowSets} :
      null;
  }

  /**
   * Query one partition replica address for join backfill.
   * @param {Object} messageRouter
   * @param {string} address
   * @param {string} sql
   * @return {Promise<{success: boolean, rows: Object[], error?: string}>}
   * @private
   */
  async queryBackfillReplicaAddress(messageRouter, address, sql) {
    try {
      const response = await messageRouter.deliver(address, {
        type: JOIN_BACKFILL_QUERY.MESSAGE_TYPE,
        sql,
        params: [],
      });
      if (response?.redirect === JOIN_BACKFILL_QUERY.RESPONSE_TYPE.LEADER_REDIRECT &&
          response?.leaderAddress) {
        return this.queryBackfillReplicaAddress(
          messageRouter,
          response.leaderAddress,
          sql,
        );
      }
      if (response?.acknowledged && response?.success) {
        return {
          success: true,
          rows: Array.isArray(response.rows) ? response.rows : [],
        };
      }

      return {
        success: false,
        rows: [],
        error: response?.error || 'query failed',
      };
    } catch (error) {
      return {
        success: false,
        rows: [],
        error: error.message,
      };
    }
  }

  /**
   * Merge replicated row sets by primary key, preferring the freshest row.
   * @param {string} tableName
   * @param {Object[][]} rowSets
   * @return {Object[]}
   * @private
   */
  mergeBackfillRowSets(tableName, rowSets) {
    const keyField = getSystemCachePrimaryKeyFieldOrFallback(
      tableName,
      CACHE_DEFAULT.PRIMARY_KEY_FALLBACK,
    );
    const mergedRows = new Map();

    for (const rowSet of rowSets) {
      const rows = Array.isArray(rowSet) ? rowSet : [];
      for (const row of rows) {
        const key = row?.[keyField] ?? row?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK];
        if (typeof key === TYPEOF.UNDEFINED || key === null) {
          continue;
        }
        const existing = mergedRows.get(key);
        if (!existing || this.isBackfillRowNewer(row, existing)) {
          mergedRows.set(key, row);
        }
      }
    }

    return [...mergedRows.values()];
  }

  /**
   * Prefer the row with the newest schema/version watermark.
   * @param {Object} candidate
   * @param {Object} existing
   * @return {boolean}
   * @private
   */
  isBackfillRowNewer(candidate, existing) {
    const candidateVersion = this.extractJoinSchemaVersionFromRecord(candidate);
    const existingVersion = this.extractJoinSchemaVersionFromRecord(existing);
    if (candidateVersion && existingVersion) {
      return this.compareJoinSchemaVersions(
        candidateVersion,
        existingVersion,
      ) > NUM.ZERO;
    }
    if (candidateVersion && !existingVersion) {
      return true;
    }
    if (!candidateVersion && existingVersion) {
      return false;
    }

    return JSON.stringify(candidate).length > JSON.stringify(existing).length;
  }

  /**
   * Make an HTTP POST request.
   * @param {string} url - URL to post to.
   * @param {Object} body - Request body.
   * @return {Promise<Object>} Response body.
   * @private
   */
  async httpPost(url, body) {
    // AbortController is a global in Node.js 22+
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.httpTimeoutMs,
    );

    try {
      const response = await fetch(url, {
        method: JOINING_HTTP.METHOD_POST,
        headers: {
          [JOINING_HTTP.HEADER_CONTENT_TYPE]: JOINING_HTTP.CONTENT_TYPE_JSON,
          [JOINING_HTTP.HEADER_CONNECTION]: JOINING_HTTP.CONNECTION_CLOSE,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const retryAfterHeader =
          response.headers.get(JOINING_HTTP.HEADER_RETRY_AFTER);
        const errorBody = await response.text();
        let parsedBody = null;
        try {
          parsedBody = JSON.parse(errorBody);
        } catch (_parseError) {
          parsedBody = null;
        }
        const httpStatusError = JOINING_ERROR_MSG.httpStatus;
        const error = new Error(httpStatusError(response.status, errorBody));
        error.statusCode = response.status;
        error.responseBody = errorBody;
        error.responseJson = parsedBody;

        const retryAfterHintMs = this.parseRetryAfterHeaderMs(
          retryAfterHeader,
        );
        if (Number.isFinite(retryAfterHintMs)) {
          error.retryAfterMs = retryAfterHintMs;
        }
        if (Number.isFinite(parsedBody?.retryAfterMs)) {
          error.retryAfterMs = Number.isFinite(error.retryAfterMs) ?
            Math.max(error.retryAfterMs, Math.floor(parsedBody.retryAfterMs)) :
            Math.floor(parsedBody.retryAfterMs);
        }
        throw error;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === JOINING_ERROR_NAME.ABORT) {
        const httpTimeoutError = JOINING_ERROR_MSG.httpTimeout;
        throw new Error(httpTimeoutError(this.config.httpTimeoutMs));
      }

      throw error;
    }
  }

  /**
   * Parse Retry-After header into milliseconds when possible.
   * Supports delta-seconds and HTTP date formats.
   * @param {string|null} retryAfterHeader
   * @return {number|null}
   * @private
   */
  parseRetryAfterHeaderMs(retryAfterHeader) {
    if (typeof retryAfterHeader !== TYPEOF.STRING ||
        retryAfterHeader.length === NUM.ZERO) {
      return null;
    }

    const deltaSeconds = Number(retryAfterHeader);
    if (Number.isFinite(deltaSeconds) && deltaSeconds >= NUM.ZERO) {
      return Math.floor(deltaSeconds * TIME_MS.SECOND);
    }

    const retryAtMs = Date.parse(retryAfterHeader);
    if (!Number.isFinite(retryAtMs)) {
      return null;
    }

    return Math.max(NUM.ZERO, retryAtMs - this.now());
  }

  /**
   * Create the shared CDC pipeline readiness gate.
   * Tests override this to inject manual time instead of wall-clock waits.
   * @param {Object} systemTableCache
   * @return {CDCPipelineReadinessGate}
   */
  createCdcPipelineReadinessGate(systemTableCache) {
    return new CDCPipelineReadinessGate({
      systemTableCache,
      cdcPropagatedTables: CDC_PROPAGATED_TABLES,
      now: () => this.now(),
      sleep: (delayMs) => this.sleep(delayMs),
    });
  }

  /**
   * Handle joining failure.
   * @param {Error} error - The error that caused failure.
   * @return {Object} Failure result.
   * @private
   */
  async handleJoiningFailure(error) {
    return this.joinCleanupHandler.handleJoiningFailure(error);
  }

  /**
   * Clean up a failed join in reverse phase order.
   * Each cleanup step undoes the work of the corresponding join phase.
   * Errors are logged but never thrown — cleanup is best-effort.
   * @param {string} failedPhase - The JOINING_PHASE that failed.
   * @param {Object} cleanupContext - Tracking info for cleanup.
   * @param {string} cleanupContext.registeredNodeId - Node ID if
   *   registered before failure.
   * @param {string[]} cleanupContext.createdServiceIds - Service IDs
   *   created before failure.
   * @param {string[]} cleanupContext.createdMessageGroupIds - Message
   *   group IDs created before failure.
   * @return {Promise<void>}
   */
  async cleanupFailedJoin(failedPhase, cleanupContext) {
    return this.joinCleanupHandler
      .cleanupFailedJoin(failedPhase, cleanupContext);
  }

  /**
   * Execute a single join cleanup step. Each step is wrapped in
   * try/catch so that cleanup errors are logged but never thrown.
   * @param {string} step - The cleanup step to execute.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _executeJoinCleanupStep(step, cleanupContext) {
    return this.joinCleanupHandler
      ._executeJoinCleanupStep(step, cleanupContext);
  }

  /**
   * Cleanup step: remove self from nodes table and remove
   * service entries created during join.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupQueryingState(cleanupContext) {
    return this.joinCleanupHandler
      ._cleanupQueryingState(cleanupContext);
  }

  /**
   * Cleanup step: stop message group services that were
   * waiting for leadership.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupWaitingLeadership() {
    return this.joinCleanupHandler
      ._cleanupWaitingLeadership();
  }

  /**
   * Cleanup step: stop message group replicas and remove
   * their service entries.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupMessageGroup(cleanupContext) {
    return this.joinCleanupHandler
      ._cleanupMessageGroup(cleanupContext);
  }

  /**
   * Cleanup step: disconnect from seed node and stop
   * the message router.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupConnectingWebSocket() {
    return this.joinCleanupHandler
      ._cleanupConnectingWebSocket();
  }

  /**
   * Clean up partially initialized services.
   * @return {Promise<void>}
   * @private
   */
  async cleanup() {
    return this.joinCleanupHandler.cleanup();
  }

  /**
   * Initialize the ReplicaHandler to handle CREATE_REPLICA/REMOVE_REPLICA.
   * Requirements: 3.1, 3.2 - Use MessageRouter directly for all communication.
   * @private
   */
  initializeReplicaHandler() {
    let messageGroupService = null;
    for (const service of this.messageGroupServices.values()) {
      if (service.isLeaderReplica() || service.getLeaderId()) {
        messageGroupService = service;
        break;
      }
    }

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

    // Caller-specific partition creation factory
    const createPartitionService = async (options) => {
      const cacheForPartition = this.systemCacheHydrated ? systemTableCache : null;
      // ReplicaHandler owns the join/bootstrap decision for each partition.
      // Reusing this handler after join completion must not force fresh user
      // tables into learner mode on this node.
      const partition = new PartitionService({
        ...options,
        transport: this.transport,
        messageGroupService: messageGroupService,
        messageRouter: this.messageRouter,
        rebalanceCoordinator: this.rebalanceCoordinator,
        replicaStateMachine: this.replicaStateMachine,
        systemTableCache: cacheForPartition,
        cdcIntegrationService: cdcIntegrationService,
        tablePolicyService: this.tablePolicyService,
      });

      await partition.initialize();

      this.partitionServices.set(options.replicaId, partition);

      const tableName = options.tableName;
      if (
        tableName &&
        messageGroupService &&
        shouldAttachPartitionCdcPropagation(tableName)
      ) {
        await messageGroupService.subscribeToCDC(tableName);

        const subscriberId = [
          'joining',
          this.nodeId,
          tableName,
          options.replicaId,
          messageGroupService?.groupId || 'message-group',
        ].join(':');
        const cdcSubscriber = async (cdcEvent) => {
          if (cdcEvent.tableName === tableName) {
            this.logger.debug(JOINING_LOG_MSG.CDC_EVENT_RECEIVED, {
              tableName: cdcEvent.tableName,
              operation: cdcEvent.operation,
              partitionId: options.partitionId,
              replicaId: options.replicaId,
            });
            const propagationMessageGroupService =
              this.resolveCdcPropagationMessageGroup(messageGroupService);
            if (!propagationMessageGroupService) {
              this.logger.warn(
                CDC_LIFECYCLE_LOG_MSG.MESSAGE_GROUP_RESOLUTION_NULL, {
                  tableName: cdcEvent.tableName,
                  operation: cdcEvent.operation,
                  reason: 'no_leader_message_group',
                },
              );
              return;
            }

            await this.propagatePartitionCDCEvent(
              propagationMessageGroupService,
              cdcEvent,
            );
          }
        };
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
      }

      return partition;
    };

    // Use shared ReplicaHandlerSetup component
    const {replicaHandler, replicaStateMachine} = ReplicaHandlerSetup.create({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
      cdcIntegrationService: cdcIntegrationService,
      systemTableCache: systemTableCache,
      createPartitionService: createPartitionService,
      dataDir: this.dataDir,
      rpcClient: this.rpcClient,
    });

    this.replicaHandler = replicaHandler;
    this.replicaStateMachine = replicaStateMachine;

    this.logger.info(JOINING_LOG_MSG.REPLICA_HANDLER_READY, {
      nodeId: this.nodeId,
      hasMessageGroupService: !!messageGroupService,
    });
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
      leaderMessageGroup.systemTableCache || NodeService.getInstance().getSystemTableCache();
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
        messageGroupService && typeof messageGroupService.subscribeToCDC === TYPEOF.FUNCTION,
        JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
          STRING.UNKNOWN,
          'subscribeToCDC not available',
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
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      messageRouter: this.messageRouter,
      cdcIntegrationService,
      cdcGroupPropagationService:
        this.latencyTopology?.cdcGroupPropagationService || null,
      systemTableCache,
      tablePolicyService: this.tablePolicyService,
      messageGroupServices: this.messageGroupServices,
      rebalanceCoordinator: this.rebalanceCoordinator,
    });

    this.heartbeatService = controlPlane.heartbeatService;
    if (typeof this.heartbeatService?.setNodeStateReporter === TYPEOF.FUNCTION) {
      this.heartbeatService.setNodeStateReporter(async (payload = {}) => {
        await this.sendControlPlaneNodeStateUpdate({
          state: payload.state,
          capabilities: payload.capabilities,
          heartbeatAt: payload.heartbeatAt,
          readyLeaseExpiresAt: payload.readyLeaseExpiresAt,
          nodeRow: payload.nodeRow,
        });
      });
    }
    this.leaseService = controlPlane.leaseService;
    this.endpointService = controlPlane.endpointService;
    this.dispatchService = controlPlane.dispatchService;
    this.rebalanceCoordinator = controlPlane.rebalanceCoordinator;

    for (const messageGroupService
      of this.messageGroupServices.values()) {
      if (messageGroupService.setTablePolicyService) {
        messageGroupService.setTablePolicyService(
          this.tablePolicyService,
        );
      }
      if (messageGroupService.setRebalanceCoordinator) {
        messageGroupService.setRebalanceCoordinator(
          this.rebalanceCoordinator,
        );
      }
    }

    for (const partition of this.partitionServices.values()) {
      if (partition.setTablePolicyService) {
        partition.setTablePolicyService(this.tablePolicyService);
      }
      if (partition.setRebalanceCoordinator) {
        partition.setRebalanceCoordinator(this.rebalanceCoordinator);
      }
    }

    this.logger.info('Control plane initialized by owner', {
      nodeId: this.nodeId,
      owner: 'ControlPlaneSetup',
      messageGroupCount: this.messageGroupServices.size,
    });
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
    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
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
        rpcClient: this.rpcClient,
      });
    });

    if (result) {
      this.runtimeServiceHandler = result.runtimeServiceHandler;
    }
  }

  /**
   * Initialize the MessageGroupServiceHandler for control-plane
   * message-group replica operations.
   * @private
   */
  initializeMessageGroupServiceHandler() {
    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
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
    });

    // Get system table cache from message group services
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

    assertCritical(systemTableCache, JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED);
    assertCritical(this.messageRouter, JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);

    // Create SQL query engine with message router for transparent remote routing
    // The query engine will route queries to remote partitions via message router
    // System cache will be populated during phaseQuerySystemState()
    const sqlQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: this.messageRouter,
      nodeId: this.nodeId,
      rebalanceCoordinator: this.rebalanceCoordinator,
    });

    const cdcIntegrationService = CDCIntegrationSetup.createForNormal({
      nodeId: this.nodeId,
      sqlQueryEngine,
      systemTableCache,
      messageRouter: this.messageRouter,
      cacheMutationTarget,
    });
    sqlQueryEngine.setCDCIntegrationService(cdcIntegrationService);

    for (const messageGroup of this.messageGroupServices.values()) {
      if (messageGroup.setCdcIntegrationService) {
        messageGroup.setCdcIntegrationService(cdcIntegrationService);
      }
    }

    this.cdcIntegrationService = cdcIntegrationService;
    this.logger.debug('CDC integration initialized by owner', {
      nodeId: this.nodeId,
      owner: 'CDCIntegrationSetup',
      mode: 'normal',
    });

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
      owner: 'LatencyTopologySetup',
    });
    return this.latencyTopology;
  }

  /**
   * Start latency topology lifecycle owners.
   * This is intentionally non-blocking relative to READY transition.
   * @private
   */
  startLatencyTopologyLifecycle() {
    const topologyOwners = assertCritical(
      this.latencyTopology,
      JOINING_ERROR_MSG.LATENCY_TOPOLOGY_MISSING,
    );
    LatencyTopologySetup.start(topologyOwners);
    this.logger.info(JOINING_LOG_MSG.LATENCY_TOPOLOGY_STARTED, {
      nodeId: this.nodeId,
      owner: 'LatencyTopologySetup',
    });
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

  /**
   * Get the node storage budget service.
   * @return {NodeStorageBudgetService}
   * @private
   */
  getNodeStorageBudgetService() {
    if (this.nodeStorageBudgetService) {
      return this.nodeStorageBudgetService;
    }

    const service = NodeStorageBudgetSetup.create({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
    });

    this.nodeStorageBudgetService = service;
    return service;
  }

  /**
   * Get the current joining phase.
   * @return {string} Current phase.
   */
  getPhase() {
    return this.phase;
  }

  /**
   * Get joining status.
   * @return {Object} Joining status.
   */
  getStatus() {
    return {
      nodeId: this.nodeId,
      phase: this.phase,
      lifecycleState: this.lifecycleStateMachine.getState(),
      startTime: this.startTime,
      duration: this.startTime ? this.now() - this.startTime : NUM.ZERO,
      messageGroupCount: this.messageGroupServices.size,
      lastError: this.lastError?.message || null,
    };
  }

  /**
   * Get the node lifecycle state machine.
   * @return {NodeLifecycleStateMachine} The lifecycle state machine.
   */
  getLifecycleStateMachine() {
    return this.lifecycleStateMachine;
  }

  /**
   * Check if joining has local message group replica with leadership.
   * @return {boolean} True if has operational message group.
   */
  hasOperationalMessageGroup() {
    for (const service of this.messageGroupServices.values()) {
      if (service.isLeaderReplica() || service.getLeaderId()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if any joined message group has a leader in the system cache.
   * @param {Object} systemTableCache - System table cache.
   * @return {boolean} True if cache reports a leader for any joined group.
   * @private
   */
  hasMessageGroupLeaderInCache(systemTableCache) {
    if (!systemTableCache) {
      return false;
    }

    const groupIds = new Set();
    for (const service of this.messageGroupServices.values()) {
      if (service?.groupId) {
        groupIds.add(service.groupId);
      }
    }

    if (groupIds.size === NUM.ZERO) {
      return false;
    }

    const services = typeof systemTableCache.filter === TYPEOF.FUNCTION ?
      systemTableCache.filter(TABLES.SERVICES, (service) =>
        service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        groupIds.has(service?.[COLUMN.GROUP_ID]) &&
        service?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
        service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
      ) :
      (systemTableCache.getAll?.(TABLES.SERVICES) || []).filter((service) =>
        service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        groupIds.has(service?.[COLUMN.GROUP_ID]) &&
        service?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
        service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
      );

    return services.length > NUM.ZERO;
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export {NodeJoiningService, JoiningPhase, NodeState};
