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
import {ReplicaHandlerSetup} from './shared/replica-handler-setup.js';
import {CDCIntegrationSetup} from './shared/cdc-integration-setup.js';
import {ControlPlaneSetup} from './shared/control-plane-setup.js';
import {LatencyTopologySetup} from './shared/latency-topology-setup.js';
import {
  waitForLocalQueryTransportReadiness,
} from './shared/local-query-transport-readiness.js';
import {
  waitForMetadataPublicationReadiness,
} from './traffic-readiness-utils.js';
import {
  buildMessageGroupOwnerNotReadyError,
  resolveOperationalMessageGroupSelection,
  resolveOperationalMessageGroupSelectionAsync,
} from './shared/message-group-selection.js';
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
import {wireMigrationWorkflowOwners} from '../migration/migration-composition.js';
import {TablePolicyService} from '../policy/table-policy-service.js';
import {NodeStorageBudgetSetup} from './shared/node-storage-budget-setup.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  BOOTSTRAP_EVENT,
  BOOTSTRAP_SUBSYSTEM,
  JOIN_DELEGATE_BUNDLE,
  JOIN_PLAN_SEGMENT,
  JOINING_PHASE,
  JOINING_PHASE_TO_SUB_PHASE,
} from './bootstrap-constants.js';
import {
  CDC_REESTABLISHMENT,
  CDC_SUBSCRIPTION_STATUS,
  JOIN_BACKFILL_QUERY,
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOINING_LOG_MSG,
  JOIN_READINESS_REPAIR,
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
  getControlPlaneMessageRequiredTables,
} from '../control-plane/control-plane-constants.js';
import {
  ControlPlaneKernelIngress,
} from '../control-plane/control-plane-kernel-ingress.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
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
import {
  createJoinStartupPlan,
  assertJoinPlanSegments,
} from './pipeline/join-startup-plan.js';
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
  activateMessageGroupServiceRows,
} from './shared/message-group-service-activation.js';
import {
  extractJoinSchemaVersionFromRecord,
  compareJoinSchemaVersions,
} from './join-schema-version-resolver.js';
import {
  MessageGroupServiceAdapter,
  RuntimeServiceAdapter,
  ServiceLifecycleManager,
  ServiceReconciler,
} from '../service/index.js';
import {JoinCoordinator} from './join-coordinator.js';
import {
  JOIN_CHECKPOINT,
  JoinSessionStore,
} from './join-session-store.js';

const JoiningPhase = JOINING_PHASE;
const JoiningEvent = BOOTSTRAP_EVENT;
const JOIN_SESSION_PHASE = Object.freeze({
  SEED_CONTACTED: 'join_session:seed_contacted',
  INFRASTRUCTURE_READY: 'join_session:infrastructure_ready',
  MEMBERSHIP_WRITTEN: 'join_session:membership_written',
  READY_LEASE_ASSIGNED: 'join_session:ready_lease_assigned',
  FINALIZED: 'join_session:finalized',
});
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
    this.advertisedNodeWsAddress = options.advertisedNodeWsAddress || null;
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
    this.joinSessionId =
      typeof options.joinSessionId === TYPEOF.STRING &&
      options.joinSessionId.length > NUM.ZERO ?
        options.joinSessionId :
        uuidv4();
    const defaultJoinSessionStore = options.joinSessionStore instanceof
      JoinSessionStore ?
        options.joinSessionStore :
        new JoinSessionStore({now: this.now});
    this.joinCoordinator = options.joinCoordinator instanceof JoinCoordinator ?
      options.joinCoordinator :
      new JoinCoordinator({
        joinSessionStore: defaultJoinSessionStore,
      });
    this.joinSessionStore = this.joinCoordinator.joinSessionStore;
    this.joinReadinessSnapshotProvider =
      typeof options.joinReadinessSnapshotProvider === TYPEOF.FUNCTION ?
        options.joinReadinessSnapshotProvider :
        null;
    this.bootstrapReadinessState = options.readinessState || null;

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
    this.inFlightBackfillsByKey = new Map();
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
    this.bootstrapTopologySnapshotMeta = null;
    this.bootstrapTopologySnapshotHydratedAtMs = null;
    // Track CDC subscription status
    this.cdcSubscriptionsActive = false;
    // Control plane target address for control messages
    this.controlPlaneTargetAddress = null;
    this.messageGroupServiceHandlerRegistered = false;
    this.messageGroupServiceEndpointsPublished = false;
    this.joinMembershipPublished = false;
    this.controlPlaneKernelIngress =
      options.controlPlaneKernelIngress instanceof ControlPlaneKernelIngress ?
        options.controlPlaneKernelIngress :
        new ControlPlaneKernelIngress({
          nodeId: this.nodeId,
          getBootstrapResponse: () => this.bootstrapResponse,
          getSeedNodeId: () => this.seedNodeId,
          getMessageRouter: () => this.messageRouter,
          getMessageGroupServices: () => this.messageGroupServices,
        });
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
        resolveControlPlaneTargetAddressCandidates: (opts) =>
          this.resolveControlPlaneTargetAddressCandidates(opts),
        getMissingSystemServiceLeaders: (cache) =>
          this.waitForLeadershipPhase.getMissingSystemServiceLeaders(cache),
        getBlockingSystemServiceLeaders: (missing, cache) =>
          this.waitForLeadershipPhase
            .getBlockingSystemServiceLeaders(missing, cache),
        backfillPropagatedCacheTables: (tables, backfillOptions) =>
          this.backfillPropagatedCacheTablesFromAuthoritativeState(
            tables,
            backfillOptions,
          ),
        getMessageRouter: () => this.messageRouter,
        getBootstrapResponse: () => this.bootstrapResponse,
        getBootstrapTopologySnapshotMeta: () =>
          this.bootstrapTopologySnapshotMeta,
        getBootstrapTopologySnapshotHydratedAtMs: () =>
          this.bootstrapTopologySnapshotHydratedAtMs,
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
        getAdvertisedNodeWsAddress: () => this.advertisedNodeWsAddress,
        getLogger: () => this.logger,
        getIdentifyPayload: () =>
          this.getIdentifyBootstrapPayload(),
        getNow: () => this.now,
        getSleep: () => this.sleep,
        resolveJoinRetryPolicy: () =>
          this.resolveJoinRetryPolicy(),
        computeSeedContactRetryDelayMs: (opts) =>
          this.computeSeedContactRetryDelayMs(opts),
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
        getNodeCapabilities: () =>
          this.getNodeCapabilities(),
        resolveMeshConnectivityNodeRows: () =>
          this.joinReadinessEvaluator
            .resolveMeshConnectivityNodeRows(),
        buildClusterMeshSignature: (rows) =>
          this.joinReadinessEvaluator
            .buildClusterMeshSignature(rows),
        setLastClusterMeshSignature: (sig) => {
          this.joinReadinessEvaluator
            .lastClusterMeshSignature = sig;
        },
      },
    });

    // Build concern-scoped delegate bundles for extracted phase modules.
    // Each bundle groups delegates by concern (D2.2) so owners receive
    // only the dependencies they need.
    this._joinDelegateBundles = this._buildJoinDelegateBundles();

    // Join cleanup handler (extracted helper)
    // Uses cleanupOnly composition so it receives cleanup + readiness
    // delegates but not phase execution or runtime wiring (D2.2).
    this.joinCleanupHandler = new JoinCleanupHandler({
      nodeId: this.nodeId,
      delegates: this._composeJoinDelegates(
        this._joinDelegateBundles, {cleanupOnly: true},
      ),
    });

    // Query system state phase (extracted helper)
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
            value && typeof value === TYPEOF.OBJECT ?
              value :
              null;
        },
        setBootstrapTopologySnapshotHydratedAtMs: (value) => {
          this.bootstrapTopologySnapshotHydratedAtMs =
            Number.isFinite(value) ? value : null;
        },
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
          this.waitForLeadershipPhase.waitForSystemServiceLeaders(cache),
        registerCreateSelfHostedMetadata: () =>
          this.registerCreateSelfHostedMetadata(),
        registerNodeInCluster: () =>
          this.registerNodeInCluster(),
        sendControlPlaneNodeStateUpdate: (options) =>
          this.sendControlPlaneNodeStateUpdate(options),
        setJoinMembershipPublished: (value) => {
          this.joinMembershipPublished = value === true;
        },
        getJoinMembershipPublished: () =>
          this.joinMembershipPublished,
        getNodeCapabilities: () =>
          this.getNodeCapabilities(),
        setMessageGroupServiceEndpointsPublished: (value) => {
          this.messageGroupServiceEndpointsPublished = value === true;
        },
        subscribeToCDCEvents: () =>
          this.subscribeToCDCEvents(),
        createCdcPipelineReadinessGate: (cache) =>
          this.createCdcPipelineReadinessGate(cache),
        backfillPropagatedCacheTablesFromAuthoritativeState:
          (tableNames) => this
            .backfillPropagatedCacheTablesFromAuthoritativeState(
              tableNames,
            ),
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
          getBootstrapReadinessState: () =>
            this.bootstrapReadinessState,
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
          registerMessageGroupService: (gId, rId, svc, opts) =>
            this.registerMessageGroupService(gId, rId, svc, opts),
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
          registerMessageGroupService: (gId, rId, svc, opts) =>
            this.registerMessageGroupService(gId, rId, svc, opts),
        },
      });

    // Error tracking
    this.lastError = null;

    // Tracks join phases completed before JOINING state for
    // retroactive sub-phase application (D5.1, Req 4.1).
    this._completedJoinPhases = [];
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
      [JOIN_DELEGATE_BUNDLE.READINESS]:
        this._buildJoinReadinessDelegates(),
      [JOIN_DELEGATE_BUNDLE.CLEANUP]:
        this._buildJoinCleanupDelegates(),
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
      getAdvertisedNodeWsAddress: () =>
        self.advertisedNodeWsAddress,
      getWsPort: () => self.wsPort ?? self.config.wsPort,
      getConfig: () => self.config,
      getLogger: () => self.logger,
      getNow: () => self.now,
      getSleep: () => self.sleep,
      getRandom: () => self.random,
      getPhase: () => self.phase,
      getStartTime: () => self.startTime,
      getHttpPostImpl: () => self.httpPostImpl,

      // -- Service collections --
      getMessageRouter: () => self.messageRouter,
      getTransport: () => self.transport,
      getMessageGroupServices: () =>
        self.messageGroupServices,
      getPartitionServices: () => self.partitionServices,
      getJoinMessageGroupReplicas: () =>
        self.joinMessageGroupReplicas,

      // -- Bootstrap response --
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

      // -- State mutators --
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
        self.joinMessageGroupReplicas =
          self.joinMessageGroupReplicas.filter(
            (s) => s !== replica,
          );
      },
      resetJoinMessageGroupReplicas: () => {
        self.joinMessageGroupReplicas = [];
      },

      // -- Phase helper callbacks (D2.3: direct owner invocation) --
      resolveJoinReplicaOptions: (id, type) =>
        self.resolveJoinReplicaOptions(id, type),
      assertReplicaStartupOwnership: (id) =>
        self.assertReplicaStartupOwnership(id),
      queueJoinServiceReplica: (desc, opts) =>
        self.queueJoinServiceReplica(desc, opts),
      createJoinServiceDescriptor: (type, id) =>
        self.createJoinServiceDescriptor(type, id),
      triggerJoinReconciler: (reason) =>
        self.triggerJoinReconciler(reason),
      resolveJoinRetryPolicy: () =>
        self.resolveJoinRetryPolicy(),
      classifySeedContactFailure: (err, msg) =>
        self.classifySeedContactFailure(err, msg),
      computeSeedContactRetryDelayMs: (opts) =>
        self.computeSeedContactRetryDelayMs(opts),
      upsertSystemTableRow: (table, data) =>
        self.upsertSystemTableRow(table, data),
      registerMessageGroupService: (gId, rId, svc, opts) =>
        self.registerMessageGroupService(
          gId, rId, svc, opts,
        ),
      getIdentifyPayload: () =>
        self.getIdentifyBootstrapPayload(),
      getNodeCapabilities: () =>
        self.getNodeCapabilities(),
      getLeaderMessageGroupService: () =>
        self.getLeaderMessageGroupService(),
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
        self.joinReadinessEvaluator
          .resolveMeshConnectivityNodeRows(),
      buildClusterMeshSignature: (rows) =>
        self.joinReadinessEvaluator
          .buildClusterMeshSignature(rows),
      setLastClusterMeshSignature: (sig) => {
        self.joinReadinessEvaluator
          .lastClusterMeshSignature = sig;
      },
      hasMessageGroupLeaderInCache: (cache) =>
        self.hasMessageGroupLeaderInCache(cache),
      getMessageGroupServicesSize: () =>
        self.messageGroupServices.size,
      emit: (event, data) => self.emit(event, data),
    };
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
      getLifecycleStateMachine: () =>
        self.lifecycleStateMachine,
      getBootstrapReadinessState: () =>
        self.bootstrapReadinessState,
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
      getStartTime: () => self.startTime,

      // -- Service collections --
      getMessageGroupServices: () =>
        self.messageGroupServices,
      getPartitionServices: () => self.partitionServices,
      getMessageRouter: () => self.messageRouter,
      getTransport: () => self.transport,
      getBootstrapResponse: () => self.bootstrapResponse,

      // -- State mutators --
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

      // -- Membership state --
      getJoinMembershipPublished: () =>
        self.joinMembershipPublished,
      setJoinMembershipPublished: (value) => {
        self.joinMembershipPublished = value === true;
      },

      // -- Resource teardown helpers --
      getCdcIntegrationService: () =>
        self.cdcIntegrationService,
      setCdcIntegrationService: (v) => {
        self.cdcIntegrationService = v;
      },
      getRebalanceCoordinator: () =>
        self.rebalanceCoordinator,
      setRebalanceCoordinator: (v) => {
        self.rebalanceCoordinator = v;
      },
      getLatencyTopology: () => self.latencyTopology,
      setLatencyTopology: (v) => {
        self.latencyTopology = v;
      },
      getReplicaStateMachine: () =>
        self.replicaStateMachine,
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
      stopJoiningLifecycleOwners: () =>
        self.stopJoiningLifecycleOwners(),
      emit: (event, data) => self.emit(event, data),
    };
  }

  /**
   * Runtime wiring delegates for join bootstrap.
   * Post-phase wiring accessors for runtime owners.
   * @return {Object} Runtime wiring delegate map.
   * @private
   */
  _buildJoinRuntimeWiringDelegates() {
    const self = this;
    return {
      getSystemTableCache: () =>
        NodeService.getInstance().getSystemTableCache(),
      getMessageRouter: () => self.messageRouter,
      getRebalanceCoordinator: () =>
        self.rebalanceCoordinator,
      getCdcIntegrationService: () =>
        self.cdcIntegrationService,
    };
  }

  /**
   * Execute checkpointed join infrastructure setup after the seed contact
   * step has completed.
   * @param {StartupPipelineRunner} startupPipelineRunner
   * @param {Object} joinPlan
   * @return {Promise<void>}
   * @private
   */
  async runJoinInfrastructurePhases(startupPipelineRunner, joinPlan) {
    const infraPhases = joinPlan.segments[JOIN_PLAN_SEGMENT.INFRASTRUCTURE];
    await startupPipelineRunner.run({
      phases: infraPhases.slice(NUM.ZERO, NUM.ONE),
    });
    this.lifecycleStateMachine.transition(NodeState.DISCOVERING);
    await startupPipelineRunner.run({
      phases: infraPhases.slice(NUM.ONE),
    });
    await this.initializeJoinInfrastructure();
    this.lifecycleStateMachine.transition(NodeState.JOINING);
    this._applyDeferredJoinSubPhases();
  }

  /**
   * Apply sub-phase transitions for join phases that completed
   * before the lifecycle state machine reached JOINING state.
   * Walks through deferred phases in order so the sub-phase chain
   * is consistent with the declarative map (D5.1, Req 4.1, 4.4).
   * @private
   */
  _applyDeferredJoinSubPhases() {
    for (const phaseName of this._completedJoinPhases) {
      const subPhase = JOINING_PHASE_TO_SUB_PHASE[phaseName];
      if (subPhase) {
        this.lifecycleStateMachine.transitionSubPhase(subPhase);
      }
    }
    this._completedJoinPhases = [];
  }

  /**
   * Initialize join-owned infrastructure after message-group establishment.
   * @return {Promise<void>}
   * @private
   */
  async initializeJoinInfrastructure() {
    // Initialize ReplicaHandler BEFORE registering node in cluster
    // because node registration can trigger CREATE_REPLICA traffic.
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
    this.messageGroupServiceHandlerRegistered = true;
    await this.initializeControlPlaneService();
    this.initializeRuntimeServiceHandler();
  }

  /**
   * Determine whether join-owned runtime infrastructure is already available
   * locally and can be reused for the current session.
   * @return {boolean}
   * @private
   */
  hasJoinInfrastructureReady() {
    return Boolean(
      this.bootstrapResponse &&
      this.messageRouter &&
      this.hasOperationalMessageGroup() &&
      this.rpcClient &&
      this.cdcIntegrationService &&
      this.heartbeatService,
    );
  }

  /**
   * Complete successful join finalization and emit the completion event.
   * @return {void}
   * @private
   */
  completeSuccessfulJoin() {
    this.lifecycleStateMachine.transition(NodeState.READY);
    for (const messageGroupService of this.messageGroupServices.values()) {
      if (typeof messageGroupService?.completeJoinConvergence ===
        TYPEOF.FUNCTION) {
        messageGroupService.completeJoinConvergence();
      }
    }
    this.activateControlPlaneBackgroundWriters();
    this.startLatencyTopologyLifecycle();
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
  }

  /**
   * Build checkpointed join steps for durable join progression.
   * @param {StartupPipelineRunner} startupPipelineRunner
   * @param {Object} joinPlan
   * @return {Array<Object>}
   * @private
   */
  buildJoinCheckpointSteps(startupPipelineRunner, joinPlan) {
    return [
      {
        checkpoint: JOIN_CHECKPOINT.SEED_CONTACTED,
        phase: JOIN_SESSION_PHASE.SEED_CONTACTED,
        segment: JOIN_PLAN_SEGMENT.SEED_CONTACT,
        shouldRerun: () => {
          return !this.bootstrapResponse ||
            !this.seedNodeId ||
            !this.seedNodeWsAddress;
        },
        run: async () => {
          await startupPipelineRunner.run({
            phases: joinPlan.segments[JOIN_PLAN_SEGMENT.SEED_CONTACT],
          });
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
        phase: JOIN_SESSION_PHASE.INFRASTRUCTURE_READY,
        segment: JOIN_PLAN_SEGMENT.INFRASTRUCTURE,
        shouldRerun: () => !this.hasJoinInfrastructureReady(),
        run: async () => {
          await this.runJoinInfrastructurePhases(
            startupPipelineRunner,
            joinPlan,
          );
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
        phase: JOIN_SESSION_PHASE.MEMBERSHIP_WRITTEN,
        segment: JOIN_PLAN_SEGMENT.MEMBERSHIP,
        run: async () => {
          await startupPipelineRunner.run({
            phases: joinPlan.segments[JOIN_PLAN_SEGMENT.MEMBERSHIP],
          });
          await this.activateMessageGroupServiceRows();
          this.startJoinOpportunisticBackfill();
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.READY_LEASE_ASSIGNED,
        phase: JOIN_SESSION_PHASE.READY_LEASE_ASSIGNED,
        segment: JOIN_PLAN_SEGMENT.READINESS,
        run: async () => {
          await this.joinReadinessEvaluator
            .waitForCanonicalJoinReadinessConvergence();
          await this.signalReadyForReplicas();
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.FINALIZED,
        phase: JOIN_SESSION_PHASE.FINALIZED,
        segment: JOIN_PLAN_SEGMENT.READINESS,
        shouldRerun: () => {
          return this.phase !== JoiningPhase.COMPLETE ||
            this.lifecycleStateMachine.getState() !== NodeState.READY ||
            this.controlPlaneBackgroundWritersActivated !== true;
        },
        run: async () => {
          this.completeSuccessfulJoin();
        },
      },
    ];
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
      joinSessionId: this.joinSessionId,
    });

    const resumePolicy = this.resolveRetryableJoinResumePolicy();
    let attempt = NUM.ZERO;

    while (true) {
      attempt += NUM.ONE;
      try {
        this.lifecycleStateMachine.transition(NodeState.CONNECTING);

        const startupPipelineRunner = new StartupPipelineRunner({
          logger: this.logger,
          eventSink: this,
        });
        const joinPlan = createJoinStartupPlan(this);
        assertJoinPlanSegments(joinPlan);
        await this.joinCoordinator.run({
          nodeId: this.nodeId,
          sessionId: this.joinSessionId,
          steps: this.buildJoinCheckpointSteps(
            startupPipelineRunner,
            joinPlan,
          ),
        });

        return {
          success: true,
          nodeId: this.nodeId,
          duration: this.now() - this.startTime,
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
        const failureResult = await this.handleJoiningFailure(error);
        if (!this.shouldAutoResumeRetryableJoinFailure(
          error,
          failureResult,
          attempt,
          resumePolicy,
        )) {
          return failureResult;
        }

        const delayMs = this.computeRetryableJoinResumeDelayMs(
          error,
          attempt,
          resumePolicy,
        );
        this.logger.warn(JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUMING, {
          nodeId: this.nodeId,
          joinSessionId: this.joinSessionId,
          attempt,
          maxAttempts: resumePolicy.maxAttempts,
          retryAfterMs: delayMs,
          phase: failureResult.phase,
          error: failureResult.error,
        });
        await this.sleep(delayMs);
      }
    }
  }

  resolveRetryableJoinResumePolicy() {
    return {
      enabled: this.config.autoResumeRetryableFailures === true,
      maxAttempts: Number.isFinite(
        this.config.retryableFailureResumeMaxAttempts,
      ) ?
        Math.max(
          NUM.ONE,
          Math.floor(this.config.retryableFailureResumeMaxAttempts),
        ) :
        JOINING_DEFAULT.retryableFailureResumeMaxAttempts,
      baseDelayMs: Number.isFinite(
        this.config.retryableFailureResumeBaseDelayMs,
      ) ?
        Math.max(
          NUM.ONE,
          Math.floor(this.config.retryableFailureResumeBaseDelayMs),
        ) :
        JOINING_DEFAULT.retryableFailureResumeBaseDelayMs,
      maxDelayMs: Number.isFinite(
        this.config.retryableFailureResumeMaxDelayMs,
      ) ?
        Math.max(
          NUM.ONE,
          Math.floor(this.config.retryableFailureResumeMaxDelayMs),
        ) :
        JOINING_DEFAULT.retryableFailureResumeMaxDelayMs,
      maxElapsedMs: Number.isFinite(
        this.config.retryableFailureResumeMaxElapsedMs,
      ) ?
        Math.max(
          NUM.ZERO,
          Math.floor(this.config.retryableFailureResumeMaxElapsedMs),
        ) :
        JOINING_DEFAULT.retryableFailureResumeMaxElapsedMs,
    };
  }

  shouldAutoResumeRetryableJoinFailure(
    error,
    failureResult,
    attempt,
    policy,
  ) {
    if (policy?.enabled !== true) {
      return false;
    }
    if (error?.name === JOINING_ERROR_NAME.ABORT) {
      return false;
    }
    const elapsedMs = this.now() - this.startTime;
    if (attempt >= policy.maxAttempts ||
        elapsedMs >= policy.maxElapsedMs) {
      this.logger.warn(
        JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUME_EXHAUSTED,
        {
          nodeId: this.nodeId,
          joinSessionId: this.joinSessionId,
          attempt,
          maxAttempts: policy.maxAttempts,
          elapsedMs,
          maxElapsedMs: policy.maxElapsedMs,
          phase: failureResult?.phase || this.getPhase(),
          error: failureResult?.error || error?.message || null,
        },
      );
      return false;
    }
    return isRetryableControlPlaneError(error);
  }

  computeRetryableJoinResumeDelayMs(error, attempt, policy) {
    const hintedDelayMs = getControlPlaneRetryAfterMs(error);
    if (hintedDelayMs > NUM.ZERO) {
      return Math.min(policy.maxDelayMs, hintedDelayMs);
    }
    const exponentialDelayMs = policy.baseDelayMs * (
      NUM.TWO ** Math.max(NUM.ZERO, attempt - NUM.ONE)
    );
    return Math.min(policy.maxDelayMs, exponentialDelayMs);
  }

  /**
   * Wait for local query/data-plane transport readiness before
   * advertising READY through the control plane.
   * @return {Promise<void>}
   * @private
   */
  async awaitLocalQueryTransportReadinessForReadySignal() {
    await waitForLocalQueryTransportReadiness({
      messageRouter: this.messageRouter,
      sleep: (delayMs) => this.sleep(delayMs),
      maxAttempts: this.config.readySignalMaxAttempts,
      initialDelayMs: this.config.readySignalRetryDelayMs,
      maxDelayMs: this.config.readySignalRetryMaxDelayMs,
      backoffMultiplier: this.config.readySignalRetryBackoffMultiplier,
      onRetry: ({attempt, maxAttempts, delayMs, readiness}) => {
        this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          nextDelayMs: delayMs,
          error:
            readiness?.reason ||
            'Local query/data-plane transport is not ready',
          gate: 'local_query_transport',
          localQueryTransport: readiness,
        });
      },
    });
  }

  /**
   * Wait for canonical lifecycle metadata-publication readiness before
   * advertising READY through the control plane.
   * @return {Promise<void>}
   * @private
   */
  async awaitMetadataPublicationReadinessForReadySignal() {
    await waitForMetadataPublicationReadiness({
      readinessState: this.bootstrapReadinessState,
      sleep: (delayMs) => this.sleep(delayMs),
      maxAttempts: this.config.readySignalMaxAttempts,
      initialDelayMs: this.config.readySignalRetryDelayMs,
      maxDelayMs: this.config.readySignalRetryMaxDelayMs,
      backoffMultiplier: this.config.readySignalRetryBackoffMultiplier,
      onRetry: ({attempt, maxAttempts, delayMs, snapshot}) => {
        this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_RETRYING, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          nextDelayMs: delayMs,
          error: 'Lifecycle metadata publication readiness is not satisfied',
          gate: 'metadata_publication_readiness',
          lifecycleReadiness: snapshot || null,
        });
      },
    });
  }

  /**
   * Signal readiness to accept replica assignments.
   * @return {Promise<void>}
   * @private
   */
  async signalReadyForReplicas() {
    // Gate: verify CDC subscriptions are active before advertising
    // readiness. If not confirmed within timeout, proceed with
    // degraded status rather than blocking indefinitely (Req 5.3).
    await this.awaitCdcSubscriptionsForReadiness();
    try {
      await this.awaitLocalQueryTransportReadinessForReadySignal();
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, {
        nodeId: this.nodeId,
        error: error?.message || 'Local query/data-plane transport is not ready',
        gate: 'local_query_transport',
        localQueryTransport: error?.localQueryTransport || null,
      });
      throw error;
    }
    try {
      await this.awaitMetadataPublicationReadinessForReadySignal();
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, {
        nodeId: this.nodeId,
        error:
          error?.message ||
          'Lifecycle metadata publication readiness is not satisfied',
        gate: 'metadata_publication_readiness',
        lifecycleReadiness: error?.lifecycleReadiness || null,
      });
      throw error;
    }

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
   * Wait for CDC subscriptions to become active before advertising
   * node readiness. If subscriptions are not confirmed within the
   * re-establishment timeout, log a degraded-status warning and
   * proceed so the node is not blocked indefinitely.
   * @return {Promise<void>}
   * @private
   */
  async awaitCdcSubscriptionsForReadiness() {
    if (this.cdcSubscriptionsActive === true) {
      this.logger.info(
        JOINING_LOG_MSG.CDC_READINESS_GATE_PASSED, {
          nodeId: this.nodeId,
        },
      );
      return;
    }

    const timeoutMs = CDC_REESTABLISHMENT.TIMEOUT_MS;
    const pollMs = CDC_REESTABLISHMENT.READINESS_GATE_POLL_MS;
    const startMs = this.now();

    this.logger.info(
      JOINING_LOG_MSG.CDC_READINESS_GATE_WAITING, {
        nodeId: this.nodeId,
        timeoutMs,
      },
    );

    while (this.now() - startMs < timeoutMs) {
      if (this.cdcSubscriptionsActive === true) {
        this.logger.info(
          JOINING_LOG_MSG.CDC_READINESS_GATE_PASSED, {
            nodeId: this.nodeId,
            elapsedMs: this.now() - startMs,
          },
        );
        return;
      }
      await this.sleep(pollMs);
    }

    this.logger.warn(
      JOINING_LOG_MSG.CDC_READINESS_GATE_DEGRADED, {
        nodeId: this.nodeId,
        timeoutMs,
        elapsedMs: this.now() - startMs,
      },
    );
  }

  /**
   * Disable control-plane heartbeat reporting when a caller explicitly wants
   * direct CDC heartbeats to be the active publication path.
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
   * Activate non-critical periodic control-plane writers once the joining
   * node reaches READY.
   * @return {void}
   * @private
   */
  activateControlPlaneBackgroundWriters() {
    if (this.controlPlaneBackgroundWritersActivated) {
      return;
    }

    if (typeof this.heartbeatService
      ?.setVerifyReporterVisibilityOnSuccess === TYPEOF.FUNCTION) {
      this.heartbeatService.setVerifyReporterVisibilityOnSuccess(false);
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
    const subPhase = JOINING_PHASE_TO_SUB_PHASE[phaseName];
    if (subPhase) {
      if (this.lifecycleStateMachine.getState() ===
          NodeState.JOINING) {
        const currentSubPhase =
          this.lifecycleStateMachine.getSubPhase();
        if (currentSubPhase !== subPhase) {
          this.lifecycleStateMachine.transitionSubPhase(subPhase);
        }
      } else {
        this._completedJoinPhases.push(phaseName);
      }
    }
    this.phase = phaseName;
    this.phaseStartTime = this.now();

    const state = this.lifecycleStateMachine.getState();
    const activeSubPhase =
      this.lifecycleStateMachine.getSubPhase() || null;

    this.logger.info(JOINING_LOG_MSG.PHASE_STARTING, {
      nodeId: this.nodeId,
      state,
      phase: phaseName,
      subPhase: activeSubPhase,
    });

    this.emit(JoiningEvent.PHASE_START, {
      phase: phaseName,
      nodeId: this.nodeId,
      state,
      subPhase: activeSubPhase,
    });

    try {
      await this.workClassScheduler.enqueue(WORK_CLASS.A, async () => {
        await phaseFunction();
      });

      const phaseDuration = this.now() - this.phaseStartTime;

      this.logger.info(JOINING_LOG_MSG.PHASE_COMPLETED, {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase,
        duration: phaseDuration,
      });

      this.emit(JoiningEvent.PHASE_COMPLETE, {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
        duration: phaseDuration,
      });
    } catch (error) {
      const phaseDuration = this.now() - this.phaseStartTime;

      this.logger.error(JOINING_LOG_MSG.PHASE_FAILED, {
        nodeId: this.nodeId,
        state,
        phase: phaseName,
        subPhase: activeSubPhase,
        duration: phaseDuration,
        error: error.message,
        stack: error.stack,
      });

      this.emit(JoiningEvent.PHASE_FAILED, {
        phase: phaseName,
        nodeId: this.nodeId,
        state,
        subPhase: activeSubPhase,
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
   * Returns the first local ingress-ready leader, or an ingress-ready relay
   * replica when the leader is remote.
   * @return {Object|null} Message group service or null.
   * @private
   */
  resolveOperationalMessageGroupSelection(options = {}) {
    const requiredTables = Array.isArray(options.requiredTables) &&
      options.requiredTables.length > 0 ?
      options.requiredTables :
      getControlPlaneMessageRequiredTables(
        ControlPlaneMessageType.NODE_STATE_UPDATE,
      );
    return resolveOperationalMessageGroupSelection(
      this.messageGroupServices,
      {requiredTables},
    );
  }

  /**
   * Resolve operational ingress after authoritative strict-forward repair for
   * system-table CDC during join convergence.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Promise<Object>}
   * @private
   */
  async resolveOperationalMessageGroupSelectionAsync(options = {}) {
    const requiredTables = Array.isArray(options.requiredTables) &&
      options.requiredTables.length > 0 ?
      options.requiredTables :
      getControlPlaneMessageRequiredTables(
        ControlPlaneMessageType.NODE_STATE_UPDATE,
      );
    return resolveOperationalMessageGroupSelectionAsync(
      this.messageGroupServices,
      {requiredTables},
    );
  }

  /**
   * Get the operational message-group service for sending lifecycle messages.
   * Returns the first local ingress-ready leader, or an ingress-ready relay
   * replica when the leader is remote.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Object|null} Message group service or null.
   * @private
   */
  getLeaderMessageGroupService(options = {}) {
    return this.resolveOperationalMessageGroupSelection(options).service;
  }

  /**
   * Resolve the message-group service to use for partition CDC propagation.
   * Prefers the current local leader when available and falls back to
   * the captured message-group service.
   * @param {Object|null} preferredMessageGroupService
   * @return {Object|null}
   */
  resolveCdcPropagationMessageGroup(preferredMessageGroupService) {
    const leaderMessageGroupService = this
      .resolveOperationalMessageGroupSelection().service;
    if (leaderMessageGroupService) {
      return leaderMessageGroupService;
    }
    return null;
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
  async registerMessageGroupService(groupId, replicaId, service, options = {}) {
    return this.createMessageGroupPhase
      .registerMessageGroupService(
        groupId,
        replicaId,
        service,
        options,
      );
  }

  async activateMessageGroupServiceRows() {
    return activateMessageGroupServiceRows({
      nodeId: this.nodeId,
      activateReplica: async ({groupId, replicaId, service}) => {
        await this.registerMessageGroupService(
          groupId,
          replicaId,
          service,
          {status: SERVICE_STATUS.ACTIVE},
        );
      },
      messageRouter: this.messageRouter,
      handlerRegistered: this.messageGroupServiceHandlerRegistered,
      endpointsPublished: this.messageGroupServiceEndpointsPublished,
      messageGroupServices: this.messageGroupServices,
    });
  }

  startJoinOpportunisticBackfill() {
    return this.querySystemStatePhase.startJoinOpportunisticBackfill();
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
   * @param {boolean} [options.allowSelfTarget=false] - Allow local message-group targets.
   * @return {string|null} Target address or null.
   * @private
   */
  resolveControlPlaneTargetAddress(options = {}) {
    return this.resolveControlPlaneTargetAddressCandidates(options)[NUM.ZERO] ||
      null;
  }

  /**
   * Resolve ordered control-plane target candidates.
   * Prefer local authoritative ingress, then remote authoritative ingress,
   * then bootstrap hints as a last resort.
   * @param {Object} [options] - Resolution options.
   * @param {boolean} [options.allowBootstrapHints=true] - Allow hint fallback.
   * @param {boolean} [options.allowSelfTarget=false] - Allow local targets.
   * @return {Array<string>} Ordered unique target addresses.
   * @private
   */
  resolveControlPlaneTargetAddressCandidates(options = {}) {
    return this.controlPlaneKernelIngress
      .resolveTargetCandidates(options);
  }

  /**
   * Determine whether a control-plane publication failure should be retried
   * against a different target address.
   * @param {?Error} error
   * @return {boolean}
   * @private
   */
  shouldRetryControlPlaneNodeStateUpdate(error) {
    const message = typeof error?.message === TYPEOF.STRING ?
      error.message :
      '';
    return message.includes('No connection to node') ||
      (message.includes('Connection to node') &&
        message.includes('closed')) ||
      message.includes('Message timeout') ||
      message.includes('No handler registered for address') ||
      message.includes(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING);
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

    const targetCandidates =
      // NODE_STATE_UPDATE is idempotent, but it still produces canonical
      // metadata writes. Only target replicas that are already ready to carry
      // that write set through the shared owner path.
      this.resolveControlPlaneTargetAddressCandidates({
        allowBootstrapHints: true,
        allowSelfTarget: true,
        localTargetMode: 'any_replica',
        requiredTables: getControlPlaneMessageRequiredTables(
          ControlPlaneMessageType.NODE_STATE_UPDATE,
        ),
      });
    if (targetCandidates.length === NUM.ZERO) {
      this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_TARGET_MISSING, {
        nodeId: this.nodeId,
        state,
      });
      throw new Error(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING);
    }

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

    let lastError = null;
    for (let attempt = NUM.ZERO; attempt < targetCandidates.length; attempt++) {
      const targetAddress = targetCandidates[attempt];
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
      const targetAddressParts = String(targetAddress).split('/');
      const publicationDiagnostics = {
        publicationPath: 'node_state_reporter',
        targetAddress,
        targetNodeId: targetAddressParts[0] || null,
        targetServiceType: targetAddressParts[1] || null,
        targetServiceId: targetAddressParts.slice(2).join('/') || null,
      };

      try {
        const deliveryResult = await this.messageRouter.deliver(
          targetAddress,
          message,
          {deliveryPriority: 'critical'},
        );
        if (deliveryResult?.acknowledged !== true) {
          throw new Error(
            deliveryResult?.error ||
            'control-plane message was not acknowledged',
          );
        }
        if (deliveryResult?.noHandler === true) {
          throw new Error(
            deliveryResult?.error ||
            `No handler registered for address ${targetAddress}`,
          );
        }
        this.logger.info(JOINING_LOG_MSG.NODE_STATE_UPDATE_SENT, {
          nodeId: this.nodeId,
          targetAddress,
          state,
        });
        if (typeof this.controlPlaneKernelIngress?.noteSuccessfulTarget ===
          TYPEOF.FUNCTION) {
          this.controlPlaneKernelIngress.noteSuccessfulTarget(targetAddress);
        }
        return publicationDiagnostics;
      } catch (error) {
        error.publicationDiagnostics = publicationDiagnostics;
        lastError = error;
        const isFinalAttempt = attempt >= targetCandidates.length - NUM.ONE;
        const shouldRetry = !isFinalAttempt &&
          this.shouldRetryControlPlaneNodeStateUpdate(error);
        if (shouldRetry) {
          if (typeof this.controlPlaneKernelIngress?.invalidateTarget ===
            TYPEOF.FUNCTION) {
            this.controlPlaneKernelIngress.invalidateTarget(targetAddress);
          }
          this.logger.warn(JOINING_LOG_MSG.NODE_STATE_UPDATE_RETRYING, {
            nodeId: this.nodeId,
            targetAddress,
            nextTargetAddress: targetCandidates[attempt + NUM.ONE],
            state,
            attempt: attempt + NUM.ONE,
            maxAttempts: targetCandidates.length,
            error: error.message,
          });
          this.controlPlaneTargetAddress = null;
          continue;
        }

        this.logger.error(JOINING_LOG_MSG.NODE_STATE_UPDATE_FAILED, {
          nodeId: this.nodeId,
          targetAddress,
          state,
          error: error.message,
        });
        const wrappedError = new Error(
          JOINING_ERROR_MSG.controlPlaneMessageFailed(error.message),
        );
        wrappedError.cause = error;
        wrappedError.publicationDiagnostics = publicationDiagnostics;
        throw wrappedError;
      }
    }

    throw lastError;
  }

  /**
   * Reconcile peer mesh connectivity without blocking node-state publication.
   * Control-plane publication is a liveness signal and should not wait on
   * best-effort background connection maintenance.
   * @param {string} state - Node connection state being reported.
   * @return {void}
   * @private
   */
  triggerBackgroundClusterMeshReconciliation(state) {
    const normalizedState = String(state || '').toLowerCase();
    if (!this.messageRouter ||
        normalizedState === STATE.DISCONNECTED ||
        normalizedState === 'failed' ||
        normalizedState === 'shutting_down' ||
        normalizedState === 'stopped' ||
        !this.joinReadinessEvaluator.shouldReconnectClusterMesh()) {
      return;
    }

    if (this.pendingClusterMeshReconciliation) {
      return;
    }

    const reconciliation = Promise.resolve()
      .then(() => this.connectToClusterNodes())
      .catch((error) => {
        this.logger.warn(
          'Failed to reconcile cluster mesh during node-state publication',
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
   * The subscription is wrapped in a bounded retry loop with
   * structured diagnostics. The total time is bounded by
   * CDC_REESTABLISHMENT.TIMEOUT_MS.
   * Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.4
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

    const startMs = this.now();
    const timeoutMs = CDC_REESTABLISHMENT.TIMEOUT_MS;
    const maxRetries = CDC_REESTABLISHMENT.MAX_RETRIES;
    const retryDelayMs = CDC_REESTABLISHMENT.RETRY_DELAY_MS;

    // Subscribe to all CDC events (insert, update, delete, upsert)
    // The CDCIntegrationService emits these events when system
    // tables change. The system cache is automatically updated by
    // the cache hydration service.
    const cdcEventHandler = (event) => {
      this.logger.debug(JOINING_LOG_MSG.CDC_EVENT_RECEIVED, {
        nodeId: this.nodeId,
        tableName: event.tableName,
        operation: event.operation || STRING.UNKNOWN,
      });
      this.handleMeshConnectivityCDCEvent(event);
    };

    const eventTypes = [
      CDC_EVENT.INSERT,
      CDC_EVENT.UPDATE,
      CDC_EVENT.DELETE,
      CDC_EVENT.UPSERT,
    ];

    // Periodic diagnostic emission during CDC recovery
    // (Requirement 8.2). Cleared in finally block so it
    // is always cleaned up on success, failure, or timeout.
    const diagnosticIntervalMs =
      CDC_REESTABLISHMENT.DIAGNOSTIC_INTERVAL_MS;
    const diagnosticInterval = setInterval(() => {
      const leaderService =
        this.getLeaderMessageGroupService();
      const messageGroupLeader = leaderService ? {
        nodeId: leaderService.nodeId || null,
        groupId: leaderService.groupId || null,
        isLeader: typeof leaderService.isLeaderReplica ===
          TYPEOF.FUNCTION ?
          leaderService.isLeaderReplica() : null,
      } : null;

      this.logger.info(
        JOINING_LOG_MSG.CDC_RECOVERY_DIAGNOSTICS, {
          nodeId: this.nodeId,
          subscriptionStatus:
            this.getCdcSubscriptionStatus(),
          messageGroupLeader,
          elapsedMs: this.now() - startMs,
        },
      );
    }, diagnosticIntervalMs);

    // Bounded retry loop for CDC subscription establishment
    let subscribed = false;
    try {
      for (
        let attempt = NUM.ZERO;
        attempt <= maxRetries;
        attempt++
      ) {
        const elapsedMs = this.now() - startMs;
        const remainingBudgetMs = timeoutMs - elapsedMs;

        // Respect overall timeout budget (§1.9)
        if (remainingBudgetMs <= NUM.ZERO) {
          this.logger.warn(
            JOINING_LOG_MSG.CDC_REESTABLISHMENT_TIMEOUT, {
              nodeId: this.nodeId,
              tables: systemTables,
              attempt,
              maxRetries,
              elapsedMs,
            },
          );
          break;
        }

        try {
          for (const eventType of eventTypes) {
            this.cdcIntegrationService.on(
              eventType, cdcEventHandler,
            );
          }

          // Verify listeners were registered
          const subscriptionStatus = {};
          for (const eventType of eventTypes) {
            const listenerCount =
              this.cdcIntegrationService
                .listenerCount(eventType);
            subscriptionStatus[eventType] = listenerCount;
            if (listenerCount === NUM.ZERO) {
              throw new Error(
                JOINING_ERROR_MSG
                  .controlPlaneCdcSubscribeFailed(
                    systemTables.join(', '),
                    `no listeners for ${eventType}`,
                  ),
              );
            }
          }

          subscribed = true;

          this.logger.info(
            JOINING_LOG_MSG.CDC_REESTABLISHMENT_COMPLETE, {
              nodeId: this.nodeId,
              tableCount: systemTables.length,
              elapsedMs: this.now() - startMs,
              subscriptionStatus,
            },
          );
          break;
        } catch (error) {
          // Remove partially registered listeners before
          // retry
          for (const eventType of eventTypes) {
            this.cdcIntegrationService.removeListener(
              eventType, cdcEventHandler,
            );
          }

          const currentElapsedMs = this.now() - startMs;
          const currentRemainingMs =
            timeoutMs - currentElapsedMs;

          this.logger.warn(
            JOINING_LOG_MSG.CDC_SUBSCRIPTION_RETRY, {
              nodeId: this.nodeId,
              tables: systemTables,
              error: error.message,
              attempt: attempt + NUM.ONE,
              maxRetries,
              remainingBudgetMs: currentRemainingMs,
            },
          );

          if (
            attempt < maxRetries &&
            currentRemainingMs > NUM.ZERO
          ) {
            const waitMs = Math.min(
              retryDelayMs, currentRemainingMs,
            );
            await this.sleep(waitMs);
          }
        }
      }
    } finally {
      clearInterval(diagnosticInterval);
    }

    // Build final subscription status for logging
    const finalStatus = {};
    for (const eventType of eventTypes) {
      finalStatus[eventType] =
        this.cdcIntegrationService.listenerCount(eventType);
    }

    if (!subscribed) {
      // All retries exhausted or timeout expired
      this.logger.warn(
        JOINING_LOG_MSG.CDC_SUBSCRIPTION_RETRY_EXHAUSTED, {
          nodeId: this.nodeId,
          tables: systemTables,
          elapsedMs: this.now() - startMs,
          maxRetries,
          subscriptionStatus: finalStatus,
        },
      );
    }

    this.logger.info(JOINING_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
      nodeId: this.nodeId,
      eventTypes,
      tableCount: systemTables.length,
      subscriptionStatus: finalStatus,
    });

    // Mark CDC subscriptions as active even if retries were
    // exhausted — partial progress is better than blocking
    // indefinitely. Task 6.4 gates readiness on full status.
    this.cdcSubscriptionsActive = true;
  }

  /**
   * Determine whether one CDC event affects peer mesh-connectivity authority.
   * Mesh connectivity should react to canonical peer membership and endpoint
   * publication, not only to local join-state publication.
   * @param {Object|null} event
   * @return {boolean}
   * @private
   */
  isMeshConnectivityCDCEvent(event) {
    const tableName = String(event?.tableName || '');
    if (tableName !== TABLES.NODES &&
        tableName !== TABLES.NODE_ENDPOINTS) {
      return false;
    }

    const operation = String(event?.operation || '').toLowerCase();
    return operation === CDC_EVENT.INSERT ||
      operation === CDC_EVENT.UPDATE ||
      operation === CDC_EVENT.UPSERT ||
      operation === CDC_EVENT.DELETE;
  }

  /**
   * Trigger best-effort peer mesh reconciliation when authoritative peer
   * visibility changes in CDC. This keeps peer dialing bound to the same
   * owner-path regardless of whether connectivity changes originate from join,
   * restart, or concurrent peer publication.
   * @param {Object|null} event
   * @return {void}
   * @private
   */
  handleMeshConnectivityCDCEvent(event) {
    if (!this.isMeshConnectivityCDCEvent(event) ||
        !this.joinReadinessEvaluator.shouldReconnectClusterMesh()) {
      return;
    }

    const normalizedOperation = String(
      event?.operation || STRING.UNKNOWN,
    ).toLowerCase();
    this.triggerBackgroundClusterMeshReconciliation(
      `cdc:${event.tableName}:${normalizedOperation}`,
    );
  }

  /**
   * Return per-table CDC subscription status.
   *
   * Reads from existing subscription state on
   * `this.cdcIntegrationService` (EventEmitter listener counts)
   * and `this.cdcSubscriptionsActive`. Does not create new state.
   *
   * @return {object} Diagnostic snapshot with:
   *   - `active` {boolean} whether subscriptions are active
   *   - `tables` {Array<object>} per-table status entries
   *   - `eventTypes` {object} per-event-type listener counts
   */
  getCdcSubscriptionStatus() {
    const tables = CACHE_HYDRATION_TABLES;
    const active = this.cdcSubscriptionsActive === true;

    const eventTypes = [
      CDC_EVENT.INSERT,
      CDC_EVENT.UPDATE,
      CDC_EVENT.DELETE,
      CDC_EVENT.UPSERT,
    ];

    // Per-event-type listener counts from the integration
    // service (single source of truth — §1.4).
    const eventListenerCounts = {};
    for (const eventType of eventTypes) {
      eventListenerCounts[eventType] =
        this.cdcIntegrationService ?
          this.cdcIntegrationService.listenerCount(
            eventType,
          ) :
          NUM.ZERO;
    }

    // Derive overall subscription health: at least one
    // listener on every event type means subscribed.
    const hasAllListeners = eventTypes.every(
      (et) => eventListenerCounts[et] > NUM.ZERO,
    );

    // Build per-table status. All tables share the same
    // event-level listeners so the status is uniform, but
    // the per-table shape is required by the diagnostic
    // contract (Requirement 8.1).
    const tableStatuses = tables.map((tableName) => {
      let status;
      if (active && hasAllListeners) {
        status = CDC_SUBSCRIPTION_STATUS.SUBSCRIBED;
      } else if (!active && !hasAllListeners) {
        status = CDC_SUBSCRIPTION_STATUS.FAILED;
      } else {
        status = CDC_SUBSCRIPTION_STATUS.PENDING;
      }
      return {tableName, status};
    });

    return {
      active,
      tables: tableStatuses,
      eventTypes: eventListenerCounts,
    };
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
    options = {},
  ) {
    const propagatedTables = this.normalizeAuthoritativeBackfillTableNames(
      tableNames,
    );
    const requestKey =
      this.buildAuthoritativeBackfillRequestKey(propagatedTables);
    const existingBackfill = this.inFlightBackfillsByKey.get(requestKey);
    if (existingBackfill) {
      return existingBackfill;
    }

    const backfillOptions =
      this.resolveAuthoritativeBackfillOptions(propagatedTables, options);
    const sqlQueryEngine = assertCritical(
      this.cdcIntegrationService?.sqlQueryEngine,
      JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED,
    );
    const systemTableCache = assertCritical(
      NodeService.getInstance().getSystemTableCache(),
      JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED,
    );
    const backfillPromise = (async () => {
      let totalRowsApplied = NUM.ZERO;
      const tableRowCounts = {};

      for (const tableName of propagatedTables) {
        const rows = await this.resolveAuthoritativeBackfillRows(
          sqlQueryEngine,
          tableName,
          backfillOptions,
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
        deliveryPriority: backfillOptions.deliveryPriority,
        pressureDegraded: backfillOptions.pressureDegraded,
        pressureAction: backfillOptions.pressureAction,
        pressureReason: backfillOptions.pressureReason,
        allowReplicaFanout: backfillOptions.allowReplicaFanout,
      });
    })()
      .finally(() => {
        if (this.inFlightBackfillsByKey.get(requestKey) === backfillPromise) {
          this.inFlightBackfillsByKey.delete(requestKey);
        }
      });

    this.inFlightBackfillsByKey.set(requestKey, backfillPromise);
    return backfillPromise;
  }

  /**
   * Normalize the authoritative backfill table list.
   * @param {Array<string>|undefined|null} tableNames
   * @return {Array<string>}
   * @private
   */
  normalizeAuthoritativeBackfillTableNames(tableNames) {
    return Array.isArray(tableNames) &&
      tableNames.length > NUM.ZERO ?
      [...new Set(tableNames)] :
      [...CACHE_HYDRATION_TABLES];
  }

  /**
   * Build a canonical in-flight key for one authoritative backfill request.
   * @param {Array<string>} tableNames
   * @return {string}
   * @private
   */
  buildAuthoritativeBackfillRequestKey(tableNames) {
    return [...tableNames].sort().join('|');
  }

  /**
   * Resolve one shared-pressure decision for authoritative join backfill.
   * @param {Array<string>} tableNames
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  evaluateAuthoritativeBackfillPressure(tableNames, options = {}) {
    const blockingTableSet = new Set(JOIN_READINESS_REPAIR.TABLES);
    const blocking = typeof options.blocking === TYPEOF.BOOLEAN ?
      options.blocking :
      tableNames.some((tableName) => blockingTableSet.has(tableName));
    return PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).evaluate({
      workClass:
        blocking ?
          PRESSURE_WORK_CLASS.INTERACTIVE :
          PRESSURE_WORK_CLASS.BACKGROUND,
      resourceKeys: [
        'join:backfill',
        'control-plane:read',
        ...tableNames.map((tableName) => `control-plane:table:${tableName}`),
      ],
      allowDegrade: false,
      allowDefer: true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  }

  /**
   * Resolve owner options for one authoritative backfill pass.
   * @param {Array<string>} tableNames
   * @param {Object} options
   * @return {Object}
   * @private
   */
  resolveAuthoritativeBackfillOptions(tableNames, options = {}) {
    const blockingTableSet = new Set(JOIN_READINESS_REPAIR.TABLES);
    const blocking = typeof options.blocking === TYPEOF.BOOLEAN ?
      options.blocking :
      tableNames.some((tableName) => blockingTableSet.has(tableName));
    const pressureDecision = this.evaluateAuthoritativeBackfillPressure(
      tableNames,
      options,
    );
    const pressureDegraded = options.pressureDegraded === true ||
      pressureDecision?.action !== PRESSURE_GOVERNOR_ACTION.ALLOW;
    return {
      blocking,
      deliveryPriority:
        typeof options.deliveryPriority === TYPEOF.STRING &&
        options.deliveryPriority.length > NUM.ZERO ?
          options.deliveryPriority :
          (blocking ? 'critical' : 'background'),
      preferBootstrapSnapshot:
        typeof options.preferBootstrapSnapshot === TYPEOF.BOOLEAN ?
          options.preferBootstrapSnapshot :
          blocking,
      allowReplicaFanout:
        typeof options.allowReplicaFanout === TYPEOF.BOOLEAN ?
          options.allowReplicaFanout :
          !pressureDegraded,
      pressureDegraded,
      pressureAction: pressureDecision?.action || null,
      pressureReason: pressureDecision?.reason || null,
      pressureSummary: pressureDecision?.summary || null,
    };
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
  async resolveAuthoritativeBackfillRows(
    sqlQueryEngine,
    tableName,
    options = {},
  ) {
    const sql = `SELECT * FROM ${tableName}`;
    const rowSets = [];
    const systemTableSnapshots =
      this.bootstrapResponse?.systemTableSnapshots || null;
    const hasBootstrapSnapshot =
      systemTableSnapshots !== null &&
      typeof systemTableSnapshots === TYPEOF.OBJECT &&
      Object.prototype.hasOwnProperty.call(systemTableSnapshots, tableName);
    const bootstrapSnapshotRows = Array.isArray(
      systemTableSnapshots?.[tableName],
    ) ?
      systemTableSnapshots[tableName] :
      [];
    if (hasBootstrapSnapshot) {
      rowSets.push(bootstrapSnapshotRows);
    }
    if (options.preferBootstrapSnapshot === true && hasBootstrapSnapshot) {
      return this.mergeBackfillRowSets(tableName, rowSets);
    }
    const routedResult = await sqlQueryEngine.executeQuery(
      sql,
      [],
      {deliveryPriority: options.deliveryPriority},
    );
    if (routedResult?.success) {
      rowSets.push(Array.isArray(routedResult.rows) ? routedResult.rows : []);
    }

    const replicaQuery = await this.queryBackfillRowsAcrossReplicas(
      sqlQueryEngine,
      tableName,
      sql,
      options,
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
  async queryBackfillRowsAcrossReplicas(
    sqlQueryEngine,
    tableName,
    sql,
    options = {},
  ) {
    if (options.allowReplicaFanout === false) {
      return null;
    }

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

    const replicaResults = [];
    for (const address of deliveryTargets) {
      replicaResults.push(
        await this.queryBackfillReplicaAddress(
          messageRouter,
          address,
          sql,
          options,
        ),
      );
    }
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
  async queryBackfillReplicaAddress(
    messageRouter,
    address,
    sql,
    options = {},
    seenAddresses = new Set(),
  ) {
    if (seenAddresses.has(address)) {
      return {
        success: false,
        rows: [],
        error: `redirect loop detected for ${address}`,
      };
    }
    const nextSeenAddresses = new Set(seenAddresses);
    nextSeenAddresses.add(address);

    try {
      const response = await messageRouter.deliver(address, {
        type: JOIN_BACKFILL_QUERY.MESSAGE_TYPE,
        sql,
        params: [],
      }, {
        deliveryPriority: options.deliveryPriority,
      });
      if (response?.redirect === JOIN_BACKFILL_QUERY.RESPONSE_TYPE.LEADER_REDIRECT &&
          response?.leaderAddress) {
        return this.queryBackfillReplicaAddress(
          messageRouter,
          response.leaderAddress,
          sql,
          options,
          nextSeenAddresses,
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
    const candidateVersion = extractJoinSchemaVersionFromRecord(candidate);
    const existingVersion = extractJoinSchemaVersionFromRecord(existing);
    if (candidateVersion && existingVersion) {
      return compareJoinSchemaVersions(
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
        sqlQueryEngine: cdcIntegrationService?.sqlQueryEngine || null,
        tablePolicyService: this.tablePolicyService,
        bootstrapReadinessState: this.bootstrapReadinessState,
      });

      await partition.initialize();

      this.partitionServices.set(options.replicaId, partition);

      const tableName = options.tableName;
      if (tableName &&
          shouldAttachPartitionCdcPropagation(tableName)) {
        const subscriptionSelection =
          await this.resolveOperationalMessageGroupSelectionAsync({
            requiredTables: [tableName],
          });
        const subscriptionMessageGroupService =
          subscriptionSelection.service;
        if (!subscriptionMessageGroupService) {
          throw buildMessageGroupOwnerNotReadyError(
            subscriptionSelection,
            {
              message:
                `Operational message-group ingress not ready ` +
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
        const cdcSubscriber = async (cdcEvent) => {
          if (cdcEvent.tableName === tableName) {
            this.logger.debug(JOINING_LOG_MSG.CDC_EVENT_RECEIVED, {
              tableName: cdcEvent.tableName,
              operation: cdcEvent.operation,
              partitionId: options.partitionId,
              replicaId: options.replicaId,
            });
            const propagationSelection =
              await this.resolveOperationalMessageGroupSelectionAsync({
                requiredTables: [tableName],
              });
            const propagationMessageGroupService =
              propagationSelection.service;
            if (!propagationMessageGroupService) {
              throw buildMessageGroupOwnerNotReadyError(
                propagationSelection,
                {
                  message:
                    `Operational message-group ingress not ready ` +
                    `for ${tableName} CDC propagation`,
                },
              );
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
      advertisedNodeWsAddress: this.advertisedNodeWsAddress,
      messageRouter: this.messageRouter,
      cdcIntegrationService,
      cdcGroupPropagationService:
        this.latencyTopology?.cdcGroupPropagationService || null,
      systemTableCache,
      tablePolicyService: this.tablePolicyService,
      messageGroupServices: this.messageGroupServices,
      rebalanceCoordinator: this.rebalanceCoordinator,
      bootstrapReadinessState: this.bootstrapReadinessState,
    });

    this.heartbeatService = controlPlane.heartbeatService;
    if (typeof this.heartbeatService?.setNodeStateReporter === TYPEOF.FUNCTION) {
      this.heartbeatService.setNodeStateReporter(async (payload = {}) => {
        return this.sendControlPlaneNodeStateUpdate({
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
      this.messageGroupServiceHandlerRegistered = true;
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
      controlPlaneReadinessService:
        this.rebalanceCoordinator?.controlPlaneReadinessService || null,
      defaultRoutingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      migrationAutoWire: false,
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
    return this.getLeaderMessageGroupService() !== null;
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
        service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
      ) :
      (systemTableCache.getAll?.(TABLES.SERVICES) || []).filter((service) =>
        service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        groupIds.has(service?.[COLUMN.GROUP_ID]) &&
        service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
      );
    if (services.length === NUM.ZERO) {
      return false;
    }

    const groupRows = typeof systemTableCache.filter === TYPEOF.FUNCTION ?
      systemTableCache.filter(TABLES.MESSAGE_GROUPS, (group) =>
        groupIds.has(group?.[COLUMN.GROUP_ID]),
      ) :
      (systemTableCache.getAll?.(TABLES.MESSAGE_GROUPS) || []).filter((group) =>
        groupIds.has(group?.[COLUMN.GROUP_ID]),
      );
    const activeServiceExistsForLeaderNode = groupRows.some((group) => {
      const leaderNodeId =
        group?.[COLUMN.LEADER_NODE_ID] ||
        group?.leader_node_id ||
        group?.leaderNodeId ||
        null;
      if (typeof leaderNodeId !== TYPEOF.STRING || leaderNodeId.length === NUM.ZERO) {
        return false;
      }
      return services.some((service) =>
        service?.[COLUMN.GROUP_ID] === group?.[COLUMN.GROUP_ID] &&
        service?.[COLUMN.NODE_ID] === leaderNodeId,
      );
    });
    if (activeServiceExistsForLeaderNode) {
      return true;
    }

    return services.some((service) => {
      return service?.[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER;
    });
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
