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

import os from 'os';
import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {NodeService} from '../node/node-service.js';
import {MessageGroupService} from '../message-group/message-group-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from './message-group-assignment.js';
import {ReplicaHandlerSetup} from './shared/replica-handler-setup.js';
import {MessageRouterSetup} from './shared/message-router-setup.js';
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
  CDC_PIPELINE_READINESS_TIMEOUT_MS,
  CDC_LIFECYCLE_LOG_MSG,
} from '../constants/cdc-lifecycle-constants.js';
import {
  getSystemCachePrimaryKeyFieldOrFallback,
} from '../cache/system-cache-key-descriptor.js';
import {SQLQueryEngine} from '../query/sql-query-engine.js';
import {TablePolicyService} from '../policy/table-policy-service.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {NodeStorageBudgetSetup} from './shared/node-storage-budget-setup.js';
import {
  BOOTSTRAP_EVENT,
  BOOTSTRAP_SUBSYSTEM,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
  JOINING_PHASE,
} from './bootstrap-constants.js';
import {
  INITIAL_PARTITION_IDS,
} from './system-table-schemas-constants.js';
import {
  getMissingSystemServiceLeaders,
  getMissingSystemServiceLeaderCount,
  isSystemTableWriteReady,
} from '../cache/leader-readiness-gate.js';
import {
  JOINING_CLEANUP_RESULT,
  JOINING_CLEANUP_STEP,
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOINING_LOG_MSG,
} from './node-joining-constants.js';
import {createRuntimeStartupWiring} from '../runtime/runtime-startup-wiring.js';
import {
  WORK_CLASS,
  WorkClassScheduler,
} from '../runtime/work-class-scheduler.js';
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
  ADDRESS,
  CDC_OPERATION,
  COLUMN,
  ENTITY_TYPE,
  ENDPOINT_STATUS,
  HTTP_STATUS,
  NUM,
  PROTOCOL,
  RUNTIME_KIND,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  STRING,
  TABLES,
  TRANSPORT_TYPE,
  TYPEOF,
  TIME_MS,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {ENTRYPOINT_DEFAULT} from '../constants/entrypoint.js';
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
  registerBuiltInMetaServiceEndpoints,
} from './shared/meta-service-definition-registration.js';
import {
  MessageGroupServiceAdapter,
  RuntimeServiceAdapter,
  ServiceLifecycleManager,
  ServiceReconciler,
} from '../service/index.js';

const JoiningPhase = JOINING_PHASE;
const JoiningEvent = BOOTSTRAP_EVENT;
const JOINING_REQUIRED_WRITE_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
]);
const DEFAULT_CACHE_SYNC_TABLES = new Set(CACHE_HYDRATION_TABLES);
const JOINING_UNIFIED_RECONCILE = Object.freeze({
  INFRA_READY_REASON: 'joining_infrastructure_ready',
  MESSAGE_GROUPS_REASON: 'joining_message_groups',
  HYDRATION_REASON: 'joining_hydration_handoff',
  CHECK_INTERVAL_MS: 60 * 60 * 1000,
  RUNTIME_KIND: RUNTIME_KIND.NATIVE_JS,
});

/**
 * Maps each JOINING_PHASE to its index in the cleanup steps array.
 * Phases that completed before the failed phase need cleanup.
 * The failed phase itself also gets cleanup.
 * @type {Object<string, number>}
 */
const JOINING_PHASE_TO_CLEANUP_INDEX = Object.freeze({
  [JoiningPhase.QUERYING_STATE]: NUM.ZERO,
  [JoiningPhase.WAITING_LEADERSHIP]: NUM.ONE,
  [JoiningPhase.CREATING_MESSAGE_GROUP]: NUM.TWO,
  [JoiningPhase.JOINING_MESSAGE_GROUP]: NUM.TWO,
  [JoiningPhase.CONNECTING_WEBSOCKET]: NUM.THREE,
  [JoiningPhase.CONTACTING_SEED]: NUM.FOUR,
});

/**
 * Cleanup steps in reverse phase order.
 * Each step undoes the work of the corresponding join phase.
 * @type {string[]}
 */
const JOINING_CLEANUP_STEPS_REVERSE = Object.freeze([
  JOINING_CLEANUP_STEP.QUERYING_STATE,
  JOINING_CLEANUP_STEP.WAITING_LEADERSHIP,
  JOINING_CLEANUP_STEP.MESSAGE_GROUP,
  JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET,
]);

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
    this.sleep = typeof options.sleep === TYPEOF.FUNCTION ?
      options.sleep :
      (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

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
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.NODE_JOINING) : console;
    this.logger.debug(JOINING_LOG_MSG.RUNTIME_WIRING_READY, {
      nodeId: this.nodeId,
      owner: 'createRuntimeStartupWiring',
      runtimeDriverCount: Object.keys(this.runtimeDrivers).length,
      ociFeatureGateEnabled: Boolean(options.ociFeatureGateEnabled),
    });
    this.joiningPhaseOwners = createJoiningPhaseOwners(this);

    // Error tracking
    this.lastError = null;
  }

  /**
   * Execute the full joining process.
   * Requirements: 4.1, 4.6, 4.7, 8.1, 8.2, 8.3 - Bootstrap sequence with lifecycle states.
   * @return {Promise<Object>} Joining result.
   */
  async join() {
    this.startTime = Date.now();

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

      await this.signalReadyForReplicas();

      // Transition to READY state
      // Requirements: 2.10 - READY state for accepting traffic
      this.lifecycleStateMachine.transition(NodeState.READY);
      this.activateControlPlaneBackgroundWriters();
      this.startLatencyTopologyLifecycle();

      // Joining complete
      this.phase = JoiningPhase.COMPLETE;
      const duration = Date.now() - this.startTime;

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
    this.phaseStartTime = Date.now();

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

      const phaseDuration = Date.now() - this.phaseStartTime;

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
      const phaseDuration = Date.now() - this.phaseStartTime;

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
    if (!this.seedNodeAddress) {
      throw new Error(JOINING_ERROR_MSG.SEED_NODE_ADDRESS_REQUIRED);
    }
    assertCritical(this.nodeAddress, JOINING_ERROR_MSG.NODE_ADDRESS_REQUIRED);

    const bootstrapUrl = `${this.seedNodeAddress}${JOINING_HTTP.BOOTSTRAP_PATH}`;

    this.logger.debug(JOINING_LOG_MSG.SEED_CONTACTING, {
      nodeId: this.nodeId,
      bootstrapUrl,
    });

    const retryPolicy = this.resolveJoinRetryPolicy();
    const retryTimeoutMs = retryPolicy.retryTimeoutMs;
    let delayMs = retryPolicy.initialDelayMs;
    const maxDelayMs = retryPolicy.maxDelayMs;
    const backoffMultiplier = retryPolicy.backoffMultiplier;
    const startTime = Date.now();
    let attempt = 0;
    let lastBootstrapError = null;
    let lastRetryableSeedContactError = null;
    const retryableTimeoutErrorMessage = JOINING_ERROR_MSG.httpTimeout(
      this.config.httpTimeoutMs,
    );

    while (Date.now() - startTime < retryTimeoutMs) {
      attempt += 1;
      try {
        const response = await this.httpPostImpl(bootstrapUrl, {
          nodeId: this.nodeId,
          nodeAddress: this.nodeAddress,
        });

        if (!response.success) {
          const bootstrapError = new Error(this.buildBootstrapFailureError(response));
          bootstrapError.bootstrapResponse = response;
          throw bootstrapError;
        }

        this.bootstrapResponse = response;
        this.seedNodeId = response.seedNodeId || null;
        if (!this.seedNodeWsAddress && response.seedNodeWsAddress) {
          this.seedNodeWsAddress = response.seedNodeWsAddress;
        }

        this.logger.debug(JOINING_LOG_MSG.BOOTSTRAP_RESPONSE_RECEIVED, {
          nodeId: this.nodeId,
          seedNodeId: response.seedNodeId,
          strategy: response.messageGroupAssignment?.strategy,
        });
        return;
      } catch (error) {
        const classification = this.classifySeedContactFailure(
          error,
          retryableTimeoutErrorMessage,
        );
        const parsedError = classification.parsedError;
        const elapsedMs = Date.now() - startTime;
        if (classification.retryable && elapsedMs < retryTimeoutMs) {
          if (classification.retryableCode) {
            lastBootstrapError = parsedError;
          }
          if (classification.retryableTimeout) {
            lastRetryableSeedContactError = error.message;
          }
          const nextDelayMs = this.computeSeedContactRetryDelayMs({
            baseDelayMs: delayMs,
            maxDelayMs,
            retryAfterMs: classification.retryAfterMs,
          });
          this.logger.debug(JOINING_LOG_MSG.SEED_CONTACT_RETRYING, {
            nodeId: this.nodeId,
            bootstrapUrl,
            attempt,
            elapsedMs,
            lastCode: classification.code,
            lastStatusCode: classification.statusCode,
            retryAfterMs: classification.retryAfterMs,
            nextDelayMs,
            retryTimeoutMs,
          });
          await this.sleep(nextDelayMs);
          delayMs = Math.min(
            Math.floor(delayMs * backoffMultiplier),
            maxDelayMs,
          );
          continue;
        }

        if (classification.terminalValidationOrConflict) {
          this.logger.warn(JOINING_LOG_MSG.SEED_CONTACT_TERMINAL, {
            nodeId: this.nodeId,
            bootstrapUrl,
            attempt,
            elapsedMs,
            statusCode: classification.statusCode,
            code: classification.code,
            error: error.message,
          });
        }

        if (parsedError) {
          if (parsedError.code ===
              BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
            throw new Error(
              JOINING_ERROR_MSG.leaderMetadataIncomplete(
                this.formatLeaderMetadataDetails(parsedError),
              ),
            );
          }

          if (parsedError.code ===
              BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
            throw new Error(
              JOINING_ERROR_MSG.bootstrapNotReady(parsedError.phase),
            );
          }
        }

        this.logger.error(JOINING_LOG_MSG.SEED_CONTACT_FAILED, {
          nodeId: this.nodeId,
          bootstrapUrl,
          error: error.message,
        });
        throw new Error(JOINING_ERROR_MSG.contactSeedFailed(error.message));
      }
    }

    if (lastBootstrapError?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
      throw new Error(
        JOINING_ERROR_MSG.leaderMetadataIncomplete(
          this.formatLeaderMetadataDetails(lastBootstrapError),
        ),
      );
    }

    if (lastBootstrapError?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
      throw new Error(
        JOINING_ERROR_MSG.bootstrapNotReady(lastBootstrapError.phase),
      );
    }

    if (lastRetryableSeedContactError) {
      throw new Error(
        JOINING_ERROR_MSG.contactSeedFailed(lastRetryableSeedContactError),
      );
    }

    throw new Error(JOINING_ERROR_MSG.contactSeedFailed(
      `seed readiness timeout after ${retryTimeoutMs}ms`,
    ));
  }

  /**
   * Resolve bounded retry policy for join-time HTTP operations.
   * @return {Object}
   * @private
   */
  resolveJoinRetryPolicy() {
    const retryTimeoutMs = Number.isFinite(this.config.leadershipWaitTimeoutMs) ?
      Math.max(this.config.leadershipWaitTimeoutMs, this.config.httpTimeoutMs) :
      this.config.httpTimeoutMs;
    const initialDelayMs = Number.isFinite(this.config.leadershipWaitInitialDelayMs) ?
      Math.max(NUM.TEN, this.config.leadershipWaitInitialDelayMs) :
      NUM.HUNDRED;
    const maxDelayMs = Number.isFinite(this.config.leadershipWaitMaxDelayMs) ?
      Math.max(initialDelayMs, this.config.leadershipWaitMaxDelayMs) :
      initialDelayMs;
    const backoffMultiplier = Number.isFinite(this.config.leadershipWaitBackoffMultiplier) &&
      this.config.leadershipWaitBackoffMultiplier > NUM.ONE ?
      this.config.leadershipWaitBackoffMultiplier :
      NUM.TWO;
    return {
      retryTimeoutMs,
      initialDelayMs,
      maxDelayMs,
      backoffMultiplier,
    };
  }

  /**
   * Classify one seed contact failure for retry/backoff behavior.
   * @param {Error} error
   * @param {string} retryableTimeoutErrorMessage
   * @return {Object}
   * @private
   */
  classifySeedContactFailure(error, retryableTimeoutErrorMessage) {
    const parsedError = error.bootstrapResponse || this.parseBootstrapError(error);
    const statusCode = Number.isFinite(error?.statusCode) ?
      Math.floor(error.statusCode) :
      (Number.isFinite(parsedError?.statusCode) ?
        Math.floor(parsedError.statusCode) :
        null);
    const code = typeof parsedError?.code === TYPEOF.STRING ?
      parsedError.code :
      null;
    const retryableCode = code === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE ||
      code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY;
    const retryableTimeout = error?.message === retryableTimeoutErrorMessage;
    const retryableStatus = statusCode === HTTP_STATUS.SERVICE_UNAVAILABLE;
    const terminalValidationOrConflict = statusCode === HTTP_STATUS.BAD_REQUEST ||
      statusCode === HTTP_STATUS.CONFLICT;

    return {
      parsedError,
      statusCode,
      code,
      retryAfterMs: this.resolveSeedContactRetryAfterMs(error, parsedError),
      retryableCode,
      retryableTimeout,
      retryableStatus,
      retryable: retryableCode || retryableTimeout || retryableStatus,
      terminalValidationOrConflict,
    };
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
    const baseDelayMs = Math.max(NUM.ONE, Number(options.baseDelayMs) || NUM.ZERO);
    const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs) || baseDelayMs);
    const retryAfterMs = Number.isFinite(options.retryAfterMs) ?
      Math.max(NUM.ZERO, Math.floor(options.retryAfterMs)) :
      null;
    const candidateDelayMs = retryAfterMs === null ?
      baseDelayMs :
      Math.min(maxDelayMs, Math.max(baseDelayMs, retryAfterMs));
    const jitteredDelayMs = this.applySeedContactRetryJitter(
      candidateDelayMs,
      maxDelayMs,
    );
    if (retryAfterMs === null) {
      return jitteredDelayMs;
    }
    return Math.max(retryAfterMs, jitteredDelayMs);
  }

  /**
   * Apply bounded symmetric jitter to one retry delay.
   * @param {number} delayMs
   * @param {number} maxDelayMs
   * @return {number}
   * @private
   */
  applySeedContactRetryJitter(delayMs, maxDelayMs) {
    const jitterRatio = Number.isFinite(this.config.leadershipWaitJitterRatio) ?
      this.config.leadershipWaitJitterRatio :
      JOINING_DEFAULT.leadershipWaitJitterRatio;
    if (jitterRatio <= NUM.ZERO) {
      return Math.min(maxDelayMs, Math.max(NUM.ONE, Math.floor(delayMs)));
    }

    const jitterRangeMs = delayMs * jitterRatio;
    const centeredRandom = (this.random() * NUM.TWO) - NUM.ONE;
    const jitterOffsetMs = Math.round(centeredRandom * jitterRangeMs);
    return Math.min(
      maxDelayMs,
      Math.max(NUM.ONE, Math.floor(delayMs + jitterOffsetMs)),
    );
  }

  /**
   * Resolve retry hint (ms) from parsed body and transport metadata.
   * @param {Error} error
   * @param {Object|null} parsedError
   * @return {number|null}
   * @private
   */
  resolveSeedContactRetryAfterMs(error, parsedError) {
    const hintCandidates = [
      error?.retryAfterMs,
      parsedError?.retryAfterMs,
      parsedError?.retry_after_ms,
    ];
    for (const hint of hintCandidates) {
      if (!Number.isFinite(hint)) {
        continue;
      }
      return Math.max(NUM.ZERO, Math.floor(hint));
    }
    return null;
  }

  /**
   * Parse bootstrap HTTP error bodies from the default HTTP client.
   * @param {Error} error
   * @return {Object|null}
   * @private
   */
  parseBootstrapError(error) {
    if (!error) {
      return null;
    }

    if (error.responseJson &&
        typeof error.responseJson === TYPEOF.OBJECT) {
      const parsedFromJson = {...error.responseJson};
      if (Number.isFinite(error.statusCode) &&
          !Number.isFinite(parsedFromJson.statusCode)) {
        parsedFromJson.statusCode = Math.floor(error.statusCode);
      }
      if (Number.isFinite(error.retryAfterMs) &&
          !Number.isFinite(parsedFromJson.retryAfterMs)) {
        parsedFromJson.retryAfterMs = Math.floor(error.retryAfterMs);
      }
      return parsedFromJson;
    }

    if (typeof error.message !== TYPEOF.STRING) {
      return null;
    }

    const match = error.message.match(/^HTTP (\d+):\s*(.*)$/s);
    if (!match) {
      return null;
    }

    const statusCode = Number.parseInt(match[1], 10);
    try {
      const parsed = JSON.parse(match[2]);
      if (Number.isFinite(statusCode) &&
          !Number.isFinite(parsed.statusCode)) {
        parsed.statusCode = statusCode;
      }
      return parsed;
    } catch (_parseError) {
      if (!Number.isFinite(statusCode)) {
        return null;
      }
      return {statusCode};
    }
  }

  /**
   * Build a consistent error message for bootstrap failures.
   * @param {Object} response
   * @return {string}
   * @private
   */
  buildBootstrapFailureError(response) {
    if (response?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
      return JOINING_ERROR_MSG.leaderMetadataIncomplete(
        this.formatLeaderMetadataDetails(response),
      );
    }

    if (response?.code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
      return JOINING_ERROR_MSG.bootstrapNotReady(response.phase);
    }

    return response?.error || JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED;
  }

  /**
   * Format leader metadata details for error reporting.
   * @param {Object} details
   * @return {string}
   * @private
   */
  formatLeaderMetadataDetails(details) {
    const parts = [];
    if (Array.isArray(details.missingPartitionLeaders) &&
        details.missingPartitionLeaders.length > NUM.ZERO) {
      parts.push(`missingPartitionLeaders=${details.missingPartitionLeaders.join(',')}`);
    }
    if (Array.isArray(details.missingMessageGroupLeaders) &&
        details.missingMessageGroupLeaders.length > NUM.ZERO) {
      parts.push(
        `missingMessageGroupLeaders=${details.missingMessageGroupLeaders.join(',')}`,
      );
    }
    if (Array.isArray(details.missingPartitionLeaderNodes) &&
        details.missingPartitionLeaderNodes.length > NUM.ZERO) {
      parts.push(
        `missingPartitionLeaderNodes=${details.missingPartitionLeaderNodes.join(',')}`,
      );
    }
    if (Array.isArray(details.missingMessageGroupLeaderNodes) &&
        details.missingMessageGroupLeaderNodes.length > NUM.ZERO) {
      parts.push(
        `missingMessageGroupLeaderNodes=${details.missingMessageGroupLeaderNodes.join(',')}`,
      );
    }

    return parts.length > NUM.ZERO ? parts.join(' ') : STRING.UNKNOWN;
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
    const definition = context?.definition || {};
    const serviceId = definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    const options = this.resolveJoinReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    );

    if (this.messageGroupServices.has(options.replicaId)) {
      return {status: SERVICE_LIFECYCLE_STATE.CREATED};
    }

    if (options.createDelayMs > NUM.ZERO) {
      await this.sleep(options.createDelayMs);
    }

    const messageGroup = new MessageGroupService({
      groupId: options.groupId,
      replicaId: options.replicaId,
      nodeId: this.nodeId,
      replicaIds: options.replicaIds,
      transport: this.messageRouter,
      peerAddresses: options.peerAddresses,
      deferElection: Boolean(options.deferElection),
    });

    const unifiedAddress = `${this.nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${options.replicaId}`;
    this.messageRouter.register(unifiedAddress, (envelope) => {
      if (options.logEnvelope) {
        this.logger.debug(JOINING_LOG_MSG.JOIN_MESSAGE_RECEIVED, {
          address: unifiedAddress,
          envelopeType: envelope?.type || envelope?.payload?.type,
          from: envelope?.from || envelope?.payload?.address,
        });
      }
      return messageGroup.receiveMessage(envelope);
    });

    if (options.logRegistration) {
      this.logger.info(JOINING_LOG_MSG.JOIN_HANDLER_REGISTERED, {
        unifiedAddress,
        nodeId: this.nodeId,
      });
    }

    await messageGroup.initialize();
    this.messageGroupServices.set(options.replicaId, messageGroup);
    this.joinMessageGroupReplicas.push(messageGroup);

    this.logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_REPLICA_CREATED, {
      groupId: options.groupId,
      replicaId: options.replicaId,
      replicaIndex: options.replicaIndex,
      nodeId: this.nodeId,
    });

    return {status: SERVICE_LIFECYCLE_STATE.CREATED};
  }

  /**
   * Unified lifecycle start hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async startJoinMessageGroupReplica(replicaHandle, _context) {
    const serviceId = replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = this.resolveJoinReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    );
    const messageGroup = this.messageGroupServices.get(options.replicaId);

    assertCritical(
      messageGroup,
      `Join message-group replica ${options.replicaId} missing at start`,
    );

    if (!options.deferElection) {
      messageGroup.startElection();
    }

    return {
      status: SERVICE_LIFECYCLE_STATE.RUNNING,
      deferred: Boolean(options.deferElection),
    };
  }

  /**
   * Unified lifecycle stop hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async stopJoinMessageGroupReplica(replicaHandle, _context) {
    const serviceId = replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options = this.resolveJoinReplicaOptions(
      serviceId,
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    );
    const messageGroup = this.messageGroupServices.get(options.replicaId);
    if (!messageGroup) {
      return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
    }

    if (messageGroup.shutdown) {
      await messageGroup.shutdown();
    }

    const unifiedAddress = `${this.nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${options.replicaId}`;
    if (this.messageRouter) {
      this.messageRouter.unregister(unifiedAddress);
    }

    this.messageGroupServices.delete(options.replicaId);
    this.joinMessageGroupReplicas = this.joinMessageGroupReplicas.filter(
      (service) => service !== messageGroup,
    );

    return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
  }

  /**
   * Compatibility shim for deferred self-hosted join elections.
   * Replica create/start ownership remains in unified lifecycle adapters.
   * @return {void}
   * @private
   */
  startDeferredJoinMessageGroupElections(groupId) {
    this.logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_ELECTIONS_START, {
      groupId,
      replicaCount: this.joinMessageGroupReplicas.length,
    });

    for (const messageGroup of this.joinMessageGroupReplicas) {
      messageGroup.startElection();
    }
  }

  /**
   * Phase 3a: Create self-hosted message group (3 replicas on this node).
   * Requirements: 8.3 - Services created AFTER self-connection established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async phaseCreateSelfHostedMessageGroup(assignment) {
    const groupId = assignment.groupId;
    const replicaCount = assignment.replicaCount || NUM.THREE;

    this.logger.debug(JOINING_LOG_MSG.SELF_HOSTED_CREATING, {
      nodeId: this.nodeId,
      groupId,
      replicaCount,
    });

    // Requirements: 8.3 - MessageRouter should already be initialized in phaseConnectWebSocket
    if (!this.messageRouter) {
      throw new Error(JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }

    const replicaStaggerDelayMs = this.config.replicaStaggerDelayMs;

    const replicaIds = [];
    for (let i = NUM.ZERO; i < replicaCount; i++) {
      replicaIds.push(`${groupId}-r${i}`);
    }

    const peerAddresses = replicaIds.map(
      (replicaId) =>
        `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`,
    );

    this.joinMessageGroupReplicas = [];
    for (let index = NUM.ZERO; index < replicaIds.length; index++) {
      const replicaId = replicaIds[index];
      this.queueJoinServiceReplica(
        this.createJoinServiceDescriptor(
          UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
          replicaId,
        ),
        {
          serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
          groupId,
          replicaId,
          replicaIds,
          replicaIndex: index,
          peerAddresses,
          deferElection: true,
          createDelayMs: index > NUM.ZERO ?
            index * replicaStaggerDelayMs :
            NUM.ZERO,
          logEnvelope: false,
          logRegistration: false,
        },
      );
    }

    await this.triggerJoinReconciler(
      JOINING_UNIFIED_RECONCILE.MESSAGE_GROUPS_REASON,
    );

    this.startDeferredJoinMessageGroupElections(groupId);

    this.logger.info(JOINING_LOG_MSG.SELF_HOSTED_CREATED, {
      nodeId: this.nodeId,
      groupId,
      replicaCount: this.messageGroupServices.size,
      hasMessageRouter: !!this.messageRouter,
    });
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
   * Phase 3b: Join existing message group by moving a replica.
   * Requirements: 8.3 - Services created AFTER self-connection established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async phaseJoinExistingMessageGroup(assignment) {
    const {groupId, peerAddresses, existingPeerIds, replicaAddresses} = assignment;

    this.logger.info(JOINING_LOG_MSG.JOIN_ASSIGNMENT_RECEIVED, {
      nodeId: this.nodeId,
      groupId,
      strategy: assignment.strategy,
      existingPeerIds: existingPeerIds,
      peerAddresses: peerAddresses,
      replicaAddresses: replicaAddresses,
      sourceNodeId: assignment.sourceNodeId,
      replicaToMove: assignment.replicaToMove,
    });

    // Requirements: 8.3 - MessageRouter should already be initialized in phaseConnectWebSocket
    if (!this.messageRouter) {
      throw new Error(JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }

    // MOVE_REPLICA strategy: Take over the existing replica ID from the source node
    // This is critical - we don't create a new replica, we take over an existing one
    // The services table entry will be UPDATED to point to this node
    const replicaId = assignment.replicaToMove;
    if (!replicaId) {
      throw new Error(JOINING_ERROR_MSG.MOVE_REPLICA_MISSING);
    }

    // The replica IDs stay the same - we're just moving one replica to a different node
    // existingPeerIds already contains all replica IDs including the one being moved
    const allReplicaIds = existingPeerIds || [];

    this.logger.info(JOINING_LOG_MSG.JOIN_CREATING_WITH_PEERS, {
      nodeId: this.nodeId,
      groupId,
      replicaId,
      allReplicaIds,
      peerAddresses: peerAddresses || [],
      hasMessageRouter: !!this.messageRouter,
      messageRouterConnections: this.messageRouter?.getConnectedNodes?.() ||
        STRING.NOT_AVAILABLE,
    });

    this.queueJoinServiceReplica(
      this.createJoinServiceDescriptor(
        UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
        replicaId,
      ),
      {
        serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
        groupId,
        replicaId,
        replicaIds: allReplicaIds,
        replicaIndex: NUM.ZERO,
        peerAddresses: peerAddresses || [],
        deferElection: false,
        createDelayMs: NUM.ZERO,
        logEnvelope: true,
        logRegistration: true,
      },
    );
    await this.triggerJoinReconciler(
      JOINING_UNIFIED_RECONCILE.MESSAGE_GROUPS_REASON,
    );

    const messageGroup = assertCritical(
      this.messageGroupServices.get(replicaId),
      JOINING_ERROR_MSG.MESSAGE_GROUP_LEADER_REQUIRED,
    );

    this.logger.info(JOINING_LOG_MSG.JOIN_SERVICE_INITIALIZED, {
      nodeId: this.nodeId,
      groupId,
      replicaId,
      role: messageGroup.role,
      isLeader: messageGroup.isLeader,
      leaderId: messageGroup.leaderId,
      raftState: messageGroup.raft?.state,
      raftTerm: messageGroup.raft?.term,
    });

    // Update the services table to point this replica to the new node
    // This is an UPDATE, not INSERT - the replica ID already exists
    await this.registerMessageGroupService(groupId, replicaId, messageGroup);

    this.logger.info(JOINING_LOG_MSG.JOINED_EXISTING_GROUP, {
      nodeId: this.nodeId,
      groupId,
      replicaId,
      hasMessageRouter: !!this.messageRouter,
      peerAddressCount: peerAddresses?.length || NUM.ZERO,
    });
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
    const now = Date.now();
    const serviceData = {
      service_id: replicaId,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: this.nodeId,
      partition_id: null,
      group_id: groupId,
      replica_id: replicaId,
      raft_role: service.getRole ? service.getRole() : service.role,
      status: SERVICE_STATUS.ACTIVE,
      address: `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`,
      created_at: now,
      updated_at: now,
    };

    // Register via HTTP POST to seed node's register-service endpoint
    const registerUrl = `${this.seedNodeAddress}${JOINING_HTTP.REGISTER_SERVICE_PATH}`;

    this.logger.debug(JOINING_LOG_MSG.REGISTERING_MESSAGE_GROUP_SERVICE, {
      nodeId: this.nodeId,
      replicaId,
      groupId,
      registerUrl,
    });

    const retryPolicy = this.resolveJoinRetryPolicy();
    const retryTimeoutMs = retryPolicy.retryTimeoutMs;
    let delayMs = retryPolicy.initialDelayMs;
    const maxDelayMs = retryPolicy.maxDelayMs;
    const backoffMultiplier = retryPolicy.backoffMultiplier;
    const retryableTimeoutErrorMessage = JOINING_ERROR_MSG.httpTimeout(
      this.config.httpTimeoutMs,
    );
    const startTime = Date.now();
    let attempt = NUM.ZERO;
    let lastError = null;

    while (Date.now() - startTime < retryTimeoutMs) {
      attempt += 1;
      try {
        const response = await this.httpPostImpl(registerUrl, serviceData);

        if (!response.success) {
          this.logger.error(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_NON_SUCCESS, {
            nodeId: this.nodeId,
            replicaId,
            error: response.error,
          });
          throw new Error(response.error || JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED);
        }

        const systemTableCache = NodeService.getInstance().getSystemTableCache();
        if (systemTableCache) {
          // Bootstrap timing exception: local cache seeding is required here because
          // join-time CDC subscriptions are activated later in phaseQuerySystemState().
          // Control-plane address resolution and readiness checks may consult the
          // local services cache before CDC fanout reaches this node.
          // See architecture.md: Sanctioned direct applySystemTableChange call sites.
          systemTableCache.applySystemTableChange(
            TABLES.SERVICES,
            CDC_OPERATION.UPSERT,
            serviceData,
          );
        }

        this.logger.info(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTERED, {
          nodeId: this.nodeId,
          replicaId,
          groupId,
          attempt,
        });
        return;
      } catch (error) {
        lastError = error;
        const elapsedMs = Date.now() - startTime;
        const classification = this.classifySeedContactFailure(
          error,
          retryableTimeoutErrorMessage,
        );
        if (classification.retryable && elapsedMs < retryTimeoutMs) {
          const nextDelayMs = this.computeSeedContactRetryDelayMs({
            baseDelayMs: delayMs,
            maxDelayMs,
            retryAfterMs: classification.retryAfterMs,
          });
          this.logger.warn(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_RETRYING, {
            nodeId: this.nodeId,
            replicaId,
            groupId,
            attempt,
            elapsedMs,
            error: error.message,
            lastCode: classification.code,
            lastStatusCode: classification.statusCode,
            retryAfterMs: classification.retryAfterMs,
            nextDelayMs,
            retryTimeoutMs,
          });
          await this.sleep(nextDelayMs);
          delayMs = Math.min(
            Math.floor(delayMs * backoffMultiplier),
            maxDelayMs,
          );
          continue;
        }
        break;
      }
    }

    const error = lastError || new Error(
      JOINING_ERROR_MSG.registerServiceTimeout(replicaId, retryTimeoutMs),
    );
    this.logger.error(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_FAILED, {
      nodeId: this.nodeId,
      replicaId,
      groupId,
      attempts: attempt,
      elapsedMs: Date.now() - startTime,
      error: error.message,
    });
    throw error;
  }

  /**
   * Persist metadata required for CREATE_SELF_HOSTED joins.
   * Ensures message_groups and per-replica services rows are present before
   * join can complete successfully.
   * @return {Promise<void>}
   * @private
   */
  async registerCreateSelfHostedMetadata() {
    const assignment = this.bootstrapResponse?.messageGroupAssignment;
    if (!assignment || assignment.strategy !== AssignmentStrategy.CREATE_SELF_HOSTED) {
      return;
    }

    const groupId = assignment.groupId;
    if (!groupId) {
      throw new Error('CREATE_SELF_HOSTED assignment missing groupId');
    }

    const replicas = Array.from(this.messageGroupServices.entries())
      .filter(([_replicaId, service]) => service?.groupId === groupId);

    if (replicas.length === NUM.ZERO) {
      throw new Error(`No local replicas found for CREATE_SELF_HOSTED group ${groupId}`);
    }

    const now = Date.now();
    const messageGroupRow = {
      group_id: groupId,
      group_name: groupId,
      replica_count: replicas.length,
      leader_node_id: this.nodeId,
      policy: '{}',
      created_at: now,
      updated_at: now,
    };

    const groupResult = await this.upsertSystemTableRow(TABLES.MESSAGE_GROUPS, messageGroupRow);
    if (!groupResult?.success) {
      throw new Error(`Failed to upsert message group metadata for ${groupId}`);
    }

    for (const [replicaId, service] of replicas) {
      await this.registerMessageGroupService(groupId, replicaId, service);
    }

    this.logger.info('Registered CREATE_SELF_HOSTED metadata', {
      nodeId: this.nodeId,
      groupId,
      replicaCount: replicas.length,
    });
  }

  /**
   * Phase 3: Wait for message group leadership establishment.
   * @return {Promise<void>}
   * @private
   */
  async phaseWaitForLeadership() {
    const startTime = Date.now();
    const timeoutMs = this.config.leadershipWaitTimeoutMs;
    let delay = this.config.leadershipWaitInitialDelayMs;
    const maxDelay = this.config.leadershipWaitMaxDelayMs;
    const backoffMultiplier = this.config.leadershipWaitBackoffMultiplier;
    const systemTableCache = NodeService.getInstance().getSystemTableCache();

    this.logger.debug(JOINING_LOG_MSG.WAITING_LEADERSHIP, {
      nodeId: this.nodeId,
      timeoutMs,
      messageGroupCount: this.messageGroupServices.size,
    });

    while (Date.now() - startTime < timeoutMs) {
      const hasCacheLeader = this.hasMessageGroupLeaderInCache(systemTableCache);

      // Check if any local replica is leader or has a known leader
      for (const [replicaId, service] of this.messageGroupServices) {
        if (service.isLeaderReplica() || service.getLeaderId()) {
          this.logger.debug(JOINING_LOG_MSG.LEADERSHIP_ESTABLISHED, {
            nodeId: this.nodeId,
            replicaId,
            isLeader: service.isLeaderReplica(),
            leaderId: service.getLeaderId(),
            elapsedMs: Date.now() - startTime,
          });
          return;
        }
      }
      if (hasCacheLeader) {
        this.logger.debug(JOINING_LOG_MSG.LEADERSHIP_ESTABLISHED, {
          nodeId: this.nodeId,
          replicaId: null,
          isLeader: false,
          leaderId: null,
          elapsedMs: Date.now() - startTime,
        });
        return;
      }

      // Wait with exponential backoff
      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    // Timeout - fail joining
    const leadershipTimeout = JOINING_ERROR_MSG.leadershipTimeout;
    throw new Error(leadershipTimeout(timeoutMs));
  }

  /**
   * Wait for system table leaders to be present in cache before seeding writes.
   * @param {Object} systemTableCache - System table cache.
   * @return {Promise<void>}
   * @private
   */
  async waitForSystemServiceLeaders(systemTableCache) {
    const startTime = Date.now();
    const timeoutMs = this.config.leadershipWaitTimeoutMs;
    let delay = this.config.leadershipWaitInitialDelayMs;
    const maxDelay = this.config.leadershipWaitMaxDelayMs;
    const backoffMultiplier = this.config.leadershipWaitBackoffMultiplier;

    this.logger.debug(JOINING_LOG_MSG.WAITING_LEADERSHIP, {
      nodeId: this.nodeId,
      timeoutMs,
    });

    while (Date.now() - startTime < timeoutMs) {
      const missing = this.getMissingSystemServiceLeaders(systemTableCache);
      const blockingMissing = this.getBlockingSystemServiceLeaders(
        missing,
        systemTableCache,
      );
      const missingCount = getMissingSystemServiceLeaderCount(blockingMissing);

      if (missingCount === NUM.ZERO) {
        return;
      }

      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    const missing = this.getMissingSystemServiceLeaders(systemTableCache);
    const blockingMissing = this.getBlockingSystemServiceLeaders(
      missing,
      systemTableCache,
    );
    const leadershipTimeout = JOINING_ERROR_MSG.leadershipTimeout;
    const error = new Error(leadershipTimeout(timeoutMs));
    error.missingLeaders = blockingMissing;
    error.missingCount = getMissingSystemServiceLeaderCount(blockingMissing);
    error.nonBlockingMissingLeaders = {
      missingMessageGroupLeaders: missing.missingMessageGroupLeaders,
      missingMessageGroupLeaderNodes: missing.missingMessageGroupLeaderNodes,
      missingMessageGroupLeaderAddresses: missing.missingMessageGroupLeaderAddresses,
    };
    error.timeoutMs = timeoutMs;
    throw error;
  }

  /**
   * Get the system tables that must be write-routable before state-query writes.
   * @return {Array<string>} Required system table names.
   * @private
   */
  getRequiredSystemWriteTables() {
    const requiredTables = [...JOINING_REQUIRED_WRITE_TABLES];
    const strategy = this.bootstrapResponse?.messageGroupAssignment?.strategy;

    if (strategy === AssignmentStrategy.CREATE_SELF_HOSTED) {
      requiredTables.push(TABLES.MESSAGE_GROUPS);
    }

    return requiredTables;
  }

  /**
   * Check whether a system table is currently write-routable for join workflow.
   * Allows follower-routed writes when leader metadata is temporarily stale.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @return {boolean} True when writes can be routed.
   * @private
   */
  isSystemTableWriteRoutable(systemTableCache, tableName) {
    if (isSystemTableWriteReady(systemTableCache, tableName)) {
      return true;
    }

    const partitionId = INITIAL_PARTITION_IDS[tableName];
    if (!partitionId || typeof systemTableCache?.filter !== TYPEOF.FUNCTION) {
      return false;
    }

    const routableServices = systemTableCache.filter(TABLES.SERVICES, (service) =>
      service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service?.[COLUMN.PARTITION_ID] === partitionId &&
      service?.[COLUMN.STATUS] !== ReplicaStatus.FAILED &&
      service?.[COLUMN.STATUS] !== ReplicaStatus.REMOVED &&
      typeof service?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
      service[COLUMN.ADDRESS].length > NUM.ZERO,
    );

    return routableServices.length > NUM.ZERO;
  }

  /**
   * Check whether the cache currently includes a partition row for a table.
   * Minimal synthetic caches in tests may omit unrelated system partitions.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @return {boolean} True when table partition is present in cache.
   * @private
   */
  hasSystemTablePartition(systemTableCache, tableName) {
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    if (!partitionId) {
      return false;
    }

    if (typeof systemTableCache?.filter === TYPEOF.FUNCTION) {
      const partitions = systemTableCache.filter(TABLES.PARTITIONS, (partition) =>
        partition?.[COLUMN.PARTITION_ID] === partitionId,
      );
      return partitions.length > NUM.ZERO;
    }

    if (typeof systemTableCache?.getAll === TYPEOF.FUNCTION) {
      const partitions = systemTableCache.getAll(TABLES.PARTITIONS) || [];
      return partitions.some((partition) => partition?.[COLUMN.PARTITION_ID] === partitionId);
    }

    return false;
  }

  /**
   * Find missing service leaders using system table cache.
   * @param {Object} systemTableCache - System table cache.
   * @return {Object} Missing leader lists.
   * @private
   */
  getMissingSystemServiceLeaders(systemTableCache) {
    return getMissingSystemServiceLeaders(systemTableCache, {
      // leader_node_id in partitions/message_groups is asynchronously propagated.
      // Join readiness only requires routable leader services (address + node_id).
      requireLeaderNodeId: false,
    });
  }

  /**
   * Keep join-time readiness gates focused on system-table write routing.
   * Message-group leader rows can legitimately lag during MOVE_REPLICA handoffs.
   * @param {Object} missing - Missing leader diagnostics.
   * @param {Object} systemTableCache - System table cache.
   * @return {Object} Blocking subset for state-query readiness.
   * @private
   */
  getBlockingSystemServiceLeaders(missing, systemTableCache) {
    const requiredTables = this.getRequiredSystemWriteTables();
    const missingPartitionLeaders = [];
    const missingPartitionLeaderNodes = [];
    const missingPartitionLeaderAddresses = [];
    const missingRequiredTables = [];

    for (const tableName of requiredTables) {
      if (!this.hasSystemTablePartition(systemTableCache, tableName)) {
        continue;
      }

      if (this.isSystemTableWriteRoutable(systemTableCache, tableName)) {
        continue;
      }

      missingRequiredTables.push(tableName);

      const partitionId = INITIAL_PARTITION_IDS[tableName];
      if (!partitionId) {
        continue;
      }
      missingPartitionLeaders.push(partitionId);

      if (missing.missingPartitionLeaderNodes?.includes(partitionId)) {
        missingPartitionLeaderNodes.push(partitionId);
      }
      if (missing.missingPartitionLeaderAddresses?.includes(partitionId)) {
        missingPartitionLeaderAddresses.push(partitionId);
      }
    }

    return {
      ...missing,
      missingPartitionLeaders,
      missingPartitionLeaderNodes,
      missingPartitionLeaderAddresses,
      missingMessageGroupLeaders: [],
      missingMessageGroupLeaderNodes: [],
      missingMessageGroupLeaderAddresses: [],
      missingRequiredTables,
    };
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

    const candidates = cache.filter(TABLES.SERVICES, (row) => {
      return row?.service_type === SERVICE_TYPE.MESSAGE_GROUP &&
        row?.group_id === groupId &&
        row?.status === SERVICE_STATUS.ACTIVE &&
        typeof row?.address === TYPEOF.STRING &&
        row.address.length > NUM.ZERO;
    });

    if (candidates.length === NUM.ZERO) {
      return null;
    }

    const preferredConnected = candidates.find((row) => {
      return row.raft_role === 'leader' &&
        (!replicaToMove || row.service_id !== replicaToMove) &&
        isConnectedNode(row.node_id);
    });
    if (preferredConnected) {
      return preferredConnected.address;
    }

    const preferredSeedConnected = candidates.find((row) => {
      return (!!seedNodeId && row.node_id === seedNodeId) &&
        (!replicaToMove || row.service_id !== replicaToMove) &&
        isConnectedNode(row.node_id);
    });
    if (preferredSeedConnected) {
      return preferredSeedConnected.address;
    }

    const anyConnected = candidates.find((row) => {
      return (!replicaToMove || row.service_id !== replicaToMove) &&
        isConnectedNode(row.node_id);
    });
    if (anyConnected) {
      return anyConnected.address;
    }

    return null;
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
   * Phase 2: Connect to seed node via WebSocket for cross-node communication.
   * Requirements: 8.1, 8.2, 8.3, 8.4 - Bootstrap sequence: server → self-connect → services.
   * @return {Promise<void>}
   * @private
   */
  async phaseConnectWebSocket() {
    // Determine WebSocket port from config or options
    const wsPort = this.wsPort ?? this.config.wsPort;
    const identifyPayload = this.getIdentifyBootstrapPayload();

    // Route message-router setup through the shared owner.
    try {
      this.messageRouter = await MessageRouterSetup.create({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: wsPort,
        identifyPayload,
      });
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.ROUTER_INIT_FAILED, {
        nodeId: this.nodeId,
        wsPort: wsPort,
        error: error.message,
        stack: error.stack,
      });
      const routerInitFailed = JOINING_ERROR_MSG.ROUTER_INIT_FAILED;
      throw new Error(routerInitFailed(error.message));
    }

    // Use MessageRouter directly for all services
    // MessageRouter handles both local and remote message delivery
    this.transport = this.messageRouter;
    await this.initializeJoiningLifecycleOwners();
    await this.triggerJoinReconciler(
      JOINING_UNIFIED_RECONCILE.INFRA_READY_REASON,
    );

    // Get seed node WebSocket address from bootstrap response or options
    const seedWsAddress = assertCritical(
      this.seedNodeWsAddress,
      JOINING_ERROR_MSG.SEED_WS_ADDRESS_REQUIRED,
    );
    const seedNodeId = assertCritical(
      this.seedNodeId,
      JOINING_ERROR_MSG.SEED_NODE_ID_REQUIRED,
    );

    this.logger.info(JOINING_LOG_MSG.SEED_WS_CONNECTING, {
      nodeId: this.nodeId,
      seedWsAddress,
      seedNodeId,
    });

    try {
      await this.messageRouter.connectToNode(seedNodeId, seedWsAddress);

      this.logger.info(JOINING_LOG_MSG.SEED_WS_CONNECTED, {
        nodeId: this.nodeId,
        seedNodeId,
        seedWsAddress,
        connectedNodes: this.messageRouter.getConnectedNodes?.() ||
          Array.from(this.messageRouter.nodeConnections?.keys() || []),
      });
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.SEED_WS_CONNECT_FAILED, {
        nodeId: this.nodeId,
        seedWsAddress,
        seedNodeId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }

    // Connect to all cluster nodes for full mesh connectivity
    // This ensures Raft messages can flow between all nodes
    await this.connectToClusterNodes();

    // Re-resolve target for each send to avoid stale cached routing targets.
    const targetAddress =
      this.resolveControlPlaneTargetAddress({allowBootstrapHints: false}) ||
      this.resolveControlPlaneTargetAddress({allowBootstrapHints: true});
    if (!targetAddress) {
      this.logger.warn(JOINING_LOG_MSG.READY_SIGNAL_TARGET_MISSING, {
        nodeId: this.nodeId,
        state: STATE.CONNECTED,
      });
      return;
    }

    this.controlPlaneTargetAddress = targetAddress;
    const registerMessage = {
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: this.nodeId,
      [ControlPlaneField.NODE_ADDRESS]: this.nodeAddress,
      [ControlPlaneField.CAPABILITIES]: this.getNodeCapabilities(),
      [ControlPlaneField.STATE]: STATE.CONNECTED,
    };

    try {
      await this.messageRouter.deliver(targetAddress, registerMessage);
      this.logger.info(JOINING_LOG_MSG.NODE_STATE_UPDATE_SENT, {
        nodeId: this.nodeId,
        targetAddress: targetAddress,
        state: STATE.CONNECTED,
      });
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.NODE_STATE_UPDATE_FAILED, {
        nodeId: this.nodeId,
        targetAddress: targetAddress,
        state: STATE.CONNECTED,
        error: error.message,
      });
      throw new Error(JOINING_ERROR_MSG.controlPlaneMessageFailed(error.message));
    }

    this.logger.debug(JOINING_LOG_MSG.WS_INFRA_READY, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      wsPort: wsPort,
      hasMessageRouter: !!this.messageRouter,
      hasSelfConnection: wsPort ? this.messageRouter.hasSelfConnection() : false,
      owner: 'MessageRouterSetup',
    });
  }

  /**
   * Connect to all cluster nodes for full mesh connectivity.
   * Skips nodes we're already connected to (checked via messageRouter).
   * All nodes are equal peers - no special treatment for any node.
   * @return {Promise<void>}
   * @private
   */
  async connectToClusterNodes() {
    const snapshots = this.bootstrapResponse?.systemTableSnapshots;
    const nodesSnapshot = snapshots?.nodes;

    if (!Array.isArray(nodesSnapshot) || nodesSnapshot.length === NUM.ZERO) {
      return;
    }

    // Filter to nodes that are not this node
    const otherNodes = nodesSnapshot.filter((node) => {
      const nodeId = node?.node_id;
      return nodeId && nodeId !== this.nodeId;
    });

    if (otherNodes.length === NUM.ZERO) {
      return;
    }

    this.logger.info(JOINING_LOG_MSG.CONNECTING_TO_CLUSTER_NODES, {
      nodeId: this.nodeId,
      otherNodeCount: otherNodes.length,
      otherNodeIds: otherNodes.map((n) => n.node_id),
    });

    // Connect to each node in parallel, skipping already-connected nodes
    const connectionPromises = otherNodes.map(async (node) => {
      const targetNodeId = node.node_id;
      const nodeAddress = node.node_address;

      // Skip if already connected (check via nodeConnections map)
      if (this.messageRouter.nodeConnections?.has(targetNodeId)) {
        return;
      }

      if (!nodeAddress) {
        this.logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          error: 'Missing node_address',
        });
        return;
      }

      // Derive WebSocket address from node address
      // node_address format: "hostname:port" (e.g., "localhost:8082")
      // WebSocket port = REST port + WS_PORT_OFFSET (2)
      const wsAddress = this.deriveWsAddressFromNodeAddress(nodeAddress);
      if (!wsAddress) {
        this.logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          nodeAddress,
          error: 'Could not derive WebSocket address',
        });
        return;
      }

      try {
        await this.messageRouter.connectToNode(targetNodeId, wsAddress);
        this.logger.info(JOINING_LOG_MSG.CLUSTER_NODE_CONNECTED, {
          nodeId: this.nodeId,
          targetNodeId,
          wsAddress,
        });
      } catch (error) {
        // Log but don't fail - the node might be temporarily unavailable
        // Raft will handle retries and leader election
        this.logger.warn(JOINING_LOG_MSG.CLUSTER_NODE_CONNECT_FAILED, {
          nodeId: this.nodeId,
          targetNodeId,
          wsAddress,
          error: error.message,
        });
      }
    });

    await Promise.all(connectionPromises);

    this.logger.info(JOINING_LOG_MSG.CLUSTER_CONNECTIONS_COMPLETE, {
      nodeId: this.nodeId,
      connectedNodes: this.messageRouter.getConnectedNodes?.() ||
        Array.from(this.messageRouter.nodeConnections?.keys() || []),
    });
  }

  /**
   * Derive WebSocket address from node REST address.
   * @param {string} nodeAddress - Node address in format "hostname:port".
   * @return {string|null} WebSocket address or null if cannot derive.
   * @private
   */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    if (!nodeAddress || typeof nodeAddress !== TYPEOF.STRING) {
      return null;
    }

    let hostname;
    let restPort;

    // Check if address is already a full WebSocket URL (ws:// or wss://)
    if (nodeAddress.startsWith(PROTOCOL.WS) || nodeAddress.startsWith(PROTOCOL.WSS)) {
      // Parse URL format: ws://hostname:port or wss://hostname:port
      const isSecure = nodeAddress.startsWith(PROTOCOL.WSS);
      const protocolPrefix = isSecure ? PROTOCOL.WSS : PROTOCOL.WS;
      const withoutProtocol = nodeAddress.substring(protocolPrefix.length);

      const colonIndex = withoutProtocol.lastIndexOf(ADDRESS.PORT_SEPARATOR);
      if (colonIndex === NUM.NEGATIVE_ONE || colonIndex === NUM.ZERO) {
        return null;
      }

      hostname = withoutProtocol.substring(NUM.ZERO, colonIndex);
      const portStr = withoutProtocol.substring(colonIndex + NUM.ONE);
      restPort = parseInt(portStr, NUM.TEN);

      if (!hostname || hostname.length === NUM.ZERO) {
        return null;
      }

      if (!Number.isFinite(restPort) || restPort <= NUM.ZERO) {
        return null;
      }

      // For WebSocket URLs, the port is already the WS port, return as-is
      return nodeAddress;
    }

    // Parse hostname:port format (REST API address)
    const colonIndex = nodeAddress.lastIndexOf(ADDRESS.PORT_SEPARATOR);
    if (colonIndex === NUM.NEGATIVE_ONE || colonIndex === NUM.ZERO) {
      // No colon found or colon at start (empty hostname)
      return null;
    }

    hostname = nodeAddress.substring(NUM.ZERO, colonIndex);
    if (!hostname || hostname.length === NUM.ZERO) {
      return null;
    }

    const portStr = nodeAddress.substring(colonIndex + NUM.ONE);
    restPort = parseInt(portStr, NUM.TEN);

    if (!Number.isFinite(restPort) || restPort <= NUM.ZERO) {
      return null;
    }

    // WebSocket port = REST port + WS_PORT_OFFSET
    const wsPort = restPort + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;
    return `${PROTOCOL.WS}${hostname}${ADDRESS.PORT_SEPARATOR}${wsPort}`;
  }

  /**
   * Hydrate system cache from bootstrap response snapshots.
   *
   * System Cache Hydration Process:
   * - Extracts complete system table snapshots from bootstrap response
   * - Populates local system cache with all cluster state:
   *   * nodes - All registered nodes
   *   * partitions - All partition metadata
   *   * services - All service addresses and Raft roles
   *   * tables - All table schemas
   *   * message_groups - All message group configurations
   *   * replica_operations - Pending operations
   *   * indices, config, live_queries, contexts, code - additional system metadata
   *   * logs is intentionally excluded from default cache hydration
   * - After hydration, node can immediately read and write to system tables
   * - System cache becomes the single source of truth for query routing
   * - No bootstrap directories needed after hydration
   *
   * Requirements: 2.1, 2.2, 2.3 - System cache hydration from bootstrap response
   * @return {Promise<void>}
   * @private
   */
  async hydrateSystemCacheFromBootstrap() {
    const snapshots = this.bootstrapResponse?.systemTableSnapshots;

    if (!snapshots) {
      this.logger.warn('Bootstrap response missing systemTableSnapshots', {
        nodeId: this.nodeId,
        hasBootstrapResponse: !!this.bootstrapResponse,
      });
      return;
    }

    // Initialize node service to get system table cache
    const nodeService = NodeService.getInstance();
    if (!nodeService.isInitialized()) {
      nodeService.initialize({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        lifecycleStateMachine: this.lifecycleStateMachine,
        autoTransitionLifecycle: false,
      });
    }

    const systemTableCache = assertCritical(
      nodeService.getSystemTableCache(),
      JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED,
    );

    // Hydrate each system table from snapshots
    const systemTables = CACHE_HYDRATION_TABLES;

    let totalRecords = NUM.ZERO;

    for (const tableName of systemTables) {
      const records = snapshots[tableName];

      if (!Array.isArray(records)) {
        this.logger.debug('Snapshot missing or invalid for table', {
          tableName,
          nodeId: this.nodeId,
        });
        continue;
      }

      for (const record of records) {
        const operation = this.getSnapshotHydrationOperation(
          systemTableCache,
          tableName,
          record,
        );
        if (!operation) {
          continue;
        }
        // Bootstrap hydration exception: joining nodes must hydrate local cache
        // from bootstrap snapshots before CDC subscriptions are active.
        // See architecture.md: Sanctioned direct applySystemTableChange call sites.
        systemTableCache.applySystemTableChange(tableName, operation, record);
        totalRecords++;
      }

      this.logger.debug('Hydrated table from snapshot', {
        tableName,
        recordCount: records.length,
        nodeId: this.nodeId,
      });
    }

    this.logger.info('System cache hydrated from bootstrap response', {
      nodeId: this.nodeId,
      totalRecords,
      tablesHydrated: systemTables.filter((t) =>
        Array.isArray(snapshots[t]) && snapshots[t].length > NUM.ZERO,
      ).length,
    });
  }

  /**
   * Resolve the cache operation for a bootstrap snapshot record.
   * Skip stale snapshot rows when cache already has an equal/newer update.
   * @param {Object} systemTableCache - System table cache.
   * @param {string} tableName - System table name.
   * @param {Object} record - Snapshot row.
   * @return {string|null} CDC operation or null when row should be skipped.
   * @private
   */
  getSnapshotHydrationOperation(systemTableCache, tableName, record) {
    const pkField = getSystemCachePrimaryKeyFieldOrFallback(
      tableName,
      CACHE_DEFAULT.PRIMARY_KEY_FALLBACK,
    );
    const key = record?.[pkField] ?? record?.[CACHE_DEFAULT.PRIMARY_KEY_FALLBACK];

    // Let cache validation handle malformed rows that have no key.
    if (typeof key === TYPEOF.UNDEFINED || key === null) {
      return CDC_OPERATION.INSERT;
    }

    if (!systemTableCache.has(tableName, key)) {
      return CDC_OPERATION.INSERT;
    }

    const existing = systemTableCache.get(tableName, key);
    const existingUpdatedAt = Number(existing?.[COLUMN.UPDATED_AT]);
    const incomingUpdatedAt = Number(record?.[COLUMN.UPDATED_AT]);
    const hasExistingUpdatedAt = Number.isFinite(existingUpdatedAt) && existingUpdatedAt > NUM.ZERO;
    const hasIncomingUpdatedAt = Number.isFinite(incomingUpdatedAt) && incomingUpdatedAt > NUM.ZERO;

    if (hasExistingUpdatedAt && (!hasIncomingUpdatedAt || existingUpdatedAt >= incomingUpdatedAt)) {
      this.logger.debug('Skipping stale snapshot row during cache hydration', {
        nodeId: this.nodeId,
        tableName,
        key,
        existingUpdatedAt,
        incomingUpdatedAt: hasIncomingUpdatedAt ? incomingUpdatedAt : null,
      });
      return null;
    }

    return CDC_OPERATION.UPSERT;
  }

  /**
   * Phase 5: Query system partitions for cluster state and register this node.
   * @return {Promise<void>}
   * @private
   */
  async phaseQuerySystemState() {
    this.logger.debug(JOINING_LOG_MSG.STATE_QUERY_START, {
      nodeId: this.nodeId,
    });

    // Initialize node service
    const nodeService = NodeService.getInstance();
    if (!nodeService.isInitialized()) {
      nodeService.initialize({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        lifecycleStateMachine: this.lifecycleStateMachine,
        autoTransitionLifecycle: false,
      });
    }

    const systemTableCache = assertCritical(
      nodeService.getSystemTableCache(),
      JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED,
    );
    const queryEngine = assertCritical(
      this.cdcIntegrationService?.sqlQueryEngine,
      JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED,
    );
    assertCritical(this.messageRouter, JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    this.ensureLatencyTopologyOwners();

    try {
      // Hydrate system cache from bootstrap response snapshots if not already done
      if (!this.systemCacheHydrated) {
        this.logger.info(JOINING_LOG_MSG.STATE_QUERY_HYDRATING_CACHE, {
          nodeId: this.nodeId,
        });

        await this.hydrateSystemCacheFromBootstrap();
        this.systemCacheHydrated = true;
      }

      // Log cache population status
      const systemTables = [
        TABLES.NODES,
        TABLES.PARTITIONS,
        TABLES.TABLES,
        TABLES.SERVICES,
        TABLES.REPLICA_OPERATIONS,
        TABLES.MESSAGE_GROUPS,
      ];

      let totalCachedRecords = NUM.ZERO;
      for (const tableName of systemTables) {
        const records = systemTableCache.getAll(tableName) || [];
        totalCachedRecords += records.length;
      }

      this.logger.info('System cache populated from bootstrap response', {
        nodeId: this.nodeId,
        totalRecords: totalCachedRecords,
      });

      // Set up query engine with system cache and message router
      queryEngine.setSystemCache(systemTableCache);
      queryEngine.setMessageRouter(this.messageRouter);

      this.logger.info(JOINING_LOG_MSG.STATE_QUERY_HYDRATION_COMPLETE, {
        nodeId: this.nodeId,
        totalRecords: totalCachedRecords,
      });

      if (!this.tablePolicyService) {
        this.tablePolicyService = new TablePolicyService({
          systemTableCache: systemTableCache,
          cdcIntegrationService: this.cdcIntegrationService,
        });
        this.tablePolicyService.initialize();
      }

      for (const partition of this.partitionServices.values()) {
        partition.setSystemTableCache(systemTableCache);
        partition.setTablePolicyService(this.tablePolicyService);
      }

      await this.waitForSystemServiceLeaders(systemTableCache);

      // Register this node in the cluster's nodes table
      await this.registerNodeInCluster();

      // Persist CREATE_SELF_HOSTED message-group metadata as part of join.
      await this.registerCreateSelfHostedMetadata();

      // Subscribe to CDC events to keep cache updated
      await this.subscribeToCDCEvents();

      // Gate: verify CDC pipeline is fully wired before proceeding.
      // Requirements 2.4, 2.6 — node must not transition to READY with
      // an incomplete CDC pipeline.
      const cdcReadinessGate = new CDCPipelineReadinessGate({
        systemTableCache,
        cdcPropagatedTables: CDC_PROPAGATED_TABLES,
      });
      const cdcReadinessTimeoutMs =
        this.config.cdcPipelineReadinessTimeoutMs ||
        CDC_PIPELINE_READINESS_TIMEOUT_MS;
      await cdcReadinessGate.waitForReady(
        {
          partitionServices: this.partitionServices,
          messageGroupServices: this.messageGroupServices,
          cdcSubscriptionsActive: this.cdcSubscriptionsActive === true,
          // Join-time leader rows can lag while replica placement settles.
          // Keep this gate focused on subscription/pipeline wiring.
          requirePropagationLeader: false,
        },
        cdcReadinessTimeoutMs,
      );

      // Hand hydrated desired/actual state to unified reconciler once.
      await this.triggerJoinReconciler(
        JOINING_UNIFIED_RECONCILE.HYDRATION_REASON,
      );
      this.stopJoiningLifecycleOwners();
    } catch (error) {
      const errorContext = {
        nodeId: this.nodeId,
        error: error.message,
      };
      if (error?.missingLeaders) {
        errorContext.missingLeaders = error.missingLeaders;
        errorContext.missingCount = error.missingCount;
        errorContext.timeoutMs = error.timeoutMs;
      }
      this.logger.error(JOINING_LOG_MSG.STATE_QUERY_HYDRATION_FAILED, errorContext);
      throw error;
    }

    this.logger.info(JOINING_LOG_MSG.STATE_QUERY_COMPLETE, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Register this node in the cluster's nodes table.
   * Uses SQL query engine to INSERT into nodes table.
   * Query routes through message router to partition leader.
   * Also registers the WebSocket endpoint in node_endpoints table.
   * Requirements: 2.1 - Joining node registers itself in cluster.
   * Requirements: 8.2 - Node registration creates endpoint in node_endpoints table.
   * @return {Promise<void>}
   * @private
   */
  async registerNodeInCluster() {
    this.logger.info('Registering node in cluster', {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

    assertCritical(
      this.cdcIntegrationService?.sqlQueryEngine,
      JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED,
    );

    // Get system information
    const cpus = os.cpus();
    const totalMemoryBytes = os.totalmem();
    const totalMemoryMb = Math.floor(totalMemoryBytes / (NUM.THOUSAND * NUM.THOUSAND));
    const cpuCores = cpus.length;

    // Use default disk size (this would ideally come from configuration)
    const diskGb = NUM.HUNDRED;

    const now = Date.now();

    const nodeData = {
      [COLUMN.NODE_ID]: this.nodeId,
      [COLUMN.NODE_ADDRESS]: this.nodeAddress,
      [COLUMN.CPU_CORES]: cpuCores,
      [COLUMN.MEMORY_MB]: totalMemoryMb,
      [COLUMN.DISK_GB]: diskGb,
      [COLUMN.CPU_USAGE_PERCENT]: NUM.ZERO,
      [COLUMN.MEMORY_USAGE_PERCENT]: NUM.ZERO,
      [COLUMN.DISK_USAGE_PERCENT]: NUM.ZERO,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.CAPABILITIES]: JSON.stringify([]),
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.READY_LEASE_EXPIRES_AT]:
        now + TIME_MS.CONTROL_PLANE_READY_LEASE,
      [COLUMN.CREATED_AT]: now,
    };

    try {
      const budgetService = this.getNodeStorageBudgetService();
      const {resolution} = await NodeStorageBudgetSetup.resolveAndPersist({
        budgetService,
        nodeRow: nodeData,
        nodeId: this.nodeId,
      });

      this.logger.info('Node registered in cluster', {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        cpuCores,
        memoryMb: totalMemoryMb,
        diskGb,
        budgetBytes: resolution?.budgetBytes || null,
        budgetSource: resolution?.source || null,
      });

      // Register WebSocket endpoint in node_endpoints table
      // Requirements: 8.2 - Node registration creates endpoint
      await this.registerNodeEndpoint(now);
      await this.registerMetaServiceEndpoints();
    } catch (error) {
      const wrappedError = new Error(`Failed to register node: ${error.message}`);
      this.logger.error('Failed to register node in cluster', {
        nodeId: this.nodeId,
        error: wrappedError.message,
      });
      throw wrappedError;
    }
  }

  /**
   * Register the WebSocket endpoint for this node in the node_endpoints table.
   * Requirements: 8.2 - Node registration creates endpoint in node_endpoints table.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerNodeEndpoint(now) {
    this.logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERING, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

    const endpointId = `ep-${this.nodeId}-ws`;

    const endpointData = {
      [COLUMN.ENDPOINT_ID]: endpointId,
      [COLUMN.NODE_ID]: this.nodeId,
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.ADDRESS]: this.nodeAddress,
      [COLUMN.PRIORITY]: NUM.ZERO,
      [COLUMN.METADATA]: JSON.stringify({}),
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.CREATED_AT]: now,
      [COLUMN.UPDATED_AT]: now,
    };

    try {
      const endpointResult = await this.upsertSystemTableRow(
        TABLES.NODE_ENDPOINTS,
        endpointData,
      );

      if (!endpointResult.success) {
        throw new Error(`Failed to register endpoint: ${endpointResult.error}`);
      }

      this.logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERED, {
        nodeId: this.nodeId,
        endpointId,
        transportType: TRANSPORT_TYPE.WEBSOCKET,
        address: this.nodeAddress,
      });
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.ENDPOINT_REGISTER_FAILED, {
        nodeId: this.nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Register built-in meta service endpoints for this joining node.
   * Ensures canonical discovery includes websocket and postgres-wire
   * endpoints for every joined participant.
   * @return {Promise<void>}
   * @private
   */
  async registerMetaServiceEndpoints() {
    try {
      await registerBuiltInMetaServiceEndpoints({
        upsertRow: async (tableName, row) =>
          this.upsertSystemTableRow(tableName, row),
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
      });
    } catch (error) {
      this.logger.error('Failed to register built-in meta service endpoints', {
        nodeId: this.nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Upsert a system-table row through CDC integration service.
   * Falls back to SQL execution for test doubles that only mock sqlQueryEngine.
   * @param {string} tableName - System table name.
   * @param {Object} rowData - Row payload.
   * @return {Promise<Object>} Upsert result.
   * @private
   */
  async upsertSystemTableRow(tableName, rowData) {
    if (typeof this.cdcIntegrationService?.upsertSystemTableRow === 'function') {
      return this.cdcIntegrationService.upsertSystemTableRow(tableName, rowData);
    }

    const columns = Object.keys(rowData);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const params = columns.map((column) => rowData[column]);
    return this.cdcIntegrationService.sqlQueryEngine.executeQuery(sql, params);
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

    const systemTables = [
      TABLES.NODES,
      TABLES.PARTITIONS,
      TABLES.SERVICES,
      TABLES.TABLES,
      TABLES.MESSAGE_GROUPS,
      TABLES.REPLICA_OPERATIONS,
    ];

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

    return Math.max(NUM.ZERO, retryAtMs - Date.now());
  }

  /**
   * Handle joining failure.
   * @param {Error} error - The error that caused failure.
   * @return {Object} Failure result.
   * @private
   */
  async handleJoiningFailure(error) {
    const failedPhase = this.phase;
    this.phase = JoiningPhase.FAILED;
    this.lastError = error;
    const duration = Date.now() - this.startTime;

    this.logger.error(JOINING_LOG_MSG.JOIN_FAILED, {
      nodeId: this.nodeId,
      phase: failedPhase,
      duration,
      error: error.message,
      stack: error.stack,
    });

    // Execute structured reverse-order cleanup before generic cleanup
    const cleanupContext = {
      registeredNodeId: this.nodeId,
      createdServiceIds: Array.from(this.messageGroupServices.keys()),
      createdMessageGroupIds: this.bootstrapResponse
        ?.messageGroupAssignment?.groupId ?
        [this.bootstrapResponse.messageGroupAssignment.groupId] :
        [],
    };
    await this.cleanupFailedJoin(failedPhase, cleanupContext);

    // Clean up partially initialized services
    await this.cleanup();

    this.emit(JoiningEvent.FAILED, {
      nodeId: this.nodeId,
      phase: this.phase,
      duration,
      error: error.message,
    });

    return {
      success: false,
      nodeId: this.nodeId,
      duration,
      error: error.message,
      phase: this.phase,
    };
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
    this.logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_START, {
      nodeId: this.nodeId,
      failedPhase,
      createdServiceIds: cleanupContext.createdServiceIds.length,
      createdMessageGroupIds:
        cleanupContext.createdMessageGroupIds.length,
    });

    const startIndex =
      JOINING_PHASE_TO_CLEANUP_INDEX[failedPhase];
    const effectiveStart = startIndex !== undefined ?
      startIndex :
      NUM.ZERO;

    const stepsToRun =
      JOINING_CLEANUP_STEPS_REVERSE.slice(effectiveStart);

    const stepResults = {};

    for (const step of stepsToRun) {
      stepResults[step] =
        await this._executeJoinCleanupStep(step, cleanupContext);
    }

    // Transition lifecycle state machine to STOPPED
    const currentState = this.lifecycleStateMachine.getState();
    if (currentState !== NodeState.STOPPED) {
      try {
        this.lifecycleStateMachine.transition(NodeState.STOPPED);
      } catch (err) {
        this.logger.warn(
          JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_COMPLETE, {
            nodeId: this.nodeId,
            transitionError: err.message,
          });
      }
    }

    this.logger.info(JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_SUMMARY, {
      nodeId: this.nodeId,
      failedPhase,
      stepResults,
    });
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
    switch (step) {
    case JOINING_CLEANUP_STEP.QUERYING_STATE:
      return this._cleanupQueryingState(cleanupContext);
    case JOINING_CLEANUP_STEP.WAITING_LEADERSHIP:
      return this._cleanupWaitingLeadership();
    case JOINING_CLEANUP_STEP.MESSAGE_GROUP:
      return this._cleanupMessageGroup(cleanupContext);
    case JOINING_CLEANUP_STEP.CONNECTING_WEBSOCKET:
      return this._cleanupConnectingWebSocket();
    default:
      return JOINING_CLEANUP_RESULT.SKIPPED;
    }
  }

  /**
   * Cleanup step: remove self from nodes table and remove
   * service entries created during join.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupQueryingState(cleanupContext) {
    try {
      this.logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE, {
          nodeId: this.nodeId,
          registeredNodeId: cleanupContext.registeredNodeId,
          serviceCount: cleanupContext.createdServiceIds.length,
        });

      // Remove self from nodes table
      if (
        cleanupContext.registeredNodeId &&
        this.cdcIntegrationService &&
        typeof this.cdcIntegrationService
          .deleteSystemTableRow === TYPEOF.FUNCTION
      ) {
        try {
          await this.cdcIntegrationService.deleteSystemTableRow(
            TABLES.NODES,
            {[COLUMN.NODE_ID]: cleanupContext.registeredNodeId},
          );
        } catch (nodeErr) {
          this.logger.warn(
            JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE_ERROR,
            {
              nodeId: this.nodeId,
              detail: 'node removal',
              error: nodeErr.message,
            });
        }
      }

      // Remove service entries created during join
      for (const serviceId of cleanupContext.createdServiceIds) {
        try {
          if (
            this.cdcIntegrationService &&
            typeof this.cdcIntegrationService
              .deleteSystemTableRow === TYPEOF.FUNCTION
          ) {
            await this.cdcIntegrationService.deleteSystemTableRow(
              TABLES.SERVICES,
              {[COLUMN.SERVICE_ID]: serviceId},
            );
          }
        } catch (svcErr) {
          this.logger.warn(
            JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE_ERROR,
            {
              nodeId: this.nodeId,
              detail: 'service removal',
              serviceId,
              error: svcErr.message,
            });
        }
      }

      this.logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE_DONE, {
          nodeId: this.nodeId,
        });
      return JOINING_CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      this.logger.warn(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_QUERYING_STATE_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return JOINING_CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Cleanup step: stop message group services that were
   * waiting for leadership.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupWaitingLeadership() {
    try {
      this.logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP, {
          nodeId: this.nodeId,
          messageGroupCount: this.messageGroupServices.size,
        });

      for (const [replicaId, messageGroup] of
        this.messageGroupServices) {
        try {
          if (messageGroup.shutdown) {
            await messageGroup.shutdown();
          }
        } catch (mgErr) {
          this.logger.warn(
            JOINING_LOG_MSG
              .FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_ERROR, {
              nodeId: this.nodeId,
              replicaId,
              error: mgErr.message,
            });
        }
      }

      this.logger.info(
        JOINING_LOG_MSG
          .FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_DONE, {
          nodeId: this.nodeId,
        });
      return JOINING_CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      this.logger.warn(
        JOINING_LOG_MSG
          .FAILED_JOIN_CLEANUP_WAITING_LEADERSHIP_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return JOINING_CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Cleanup step: stop message group replicas and remove
   * their service entries.
   * @param {Object} cleanupContext - Cleanup context.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupMessageGroup(cleanupContext) {
    try {
      this.logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_MESSAGE_GROUP, {
          nodeId: this.nodeId,
          messageGroupCount: this.messageGroupServices.size,
          serviceCount: cleanupContext.createdServiceIds.length,
        });

      // Stop message group replicas
      for (const [replicaId, messageGroup] of
        this.messageGroupServices) {
        try {
          if (messageGroup.shutdown) {
            await messageGroup.shutdown();
          }
        } catch (mgErr) {
          this.logger.warn(
            JOINING_LOG_MSG
              .FAILED_JOIN_CLEANUP_MESSAGE_GROUP_ERROR, {
              nodeId: this.nodeId,
              replicaId,
              error: mgErr.message,
            });
        }
      }

      // Unregister from message router
      if (this.messageRouter) {
        for (const [replicaId] of this.messageGroupServices) {
          const address =
            `${this.nodeId}${ADDRESS.SEPARATOR}` +
            `${ENTITY_TYPE.MESSAGE_GROUP}` +
            `${ADDRESS.SEPARATOR}${replicaId}`;
          this.messageRouter.unregister(address);
        }
      }

      // Remove service entries for message group replicas
      for (const serviceId of cleanupContext.createdServiceIds) {
        try {
          if (
            this.cdcIntegrationService &&
            typeof this.cdcIntegrationService
              .deleteSystemTableRow === TYPEOF.FUNCTION
          ) {
            await this.cdcIntegrationService.deleteSystemTableRow(
              TABLES.SERVICES,
              {[COLUMN.SERVICE_ID]: serviceId},
            );
          }
        } catch (svcErr) {
          this.logger.warn(
            JOINING_LOG_MSG
              .FAILED_JOIN_CLEANUP_MESSAGE_GROUP_ERROR, {
              nodeId: this.nodeId,
              serviceId,
              error: svcErr.message,
            });
        }
      }

      this.logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_MESSAGE_GROUP_DONE, {
          nodeId: this.nodeId,
        });
      return JOINING_CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      this.logger.warn(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_MESSAGE_GROUP_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return JOINING_CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Cleanup step: disconnect from seed node and stop
   * the message router.
   * @return {Promise<string>} Cleanup result constant.
   * @private
   */
  async _cleanupConnectingWebSocket() {
    try {
      this.logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WEBSOCKET, {
          nodeId: this.nodeId,
          hasRouter: !!this.messageRouter,
        });

      this.stopJoiningLifecycleOwners();

      if (this.messageRouter && this.messageRouter.shutdown) {
        await this.messageRouter.shutdown();
      }

      if (
        this.transport &&
        this.transport.shutdown &&
        this.transport !== this.messageRouter
      ) {
        await this.transport.shutdown();
      }

      this.logger.info(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WEBSOCKET_DONE, {
          nodeId: this.nodeId,
        });
      return JOINING_CLEANUP_RESULT.SUCCESS;
    } catch (err) {
      this.logger.warn(
        JOINING_LOG_MSG.FAILED_JOIN_CLEANUP_WEBSOCKET_ERROR, {
          nodeId: this.nodeId,
          error: err.message,
          stack: err.stack,
        });
      return JOINING_CLEANUP_RESULT.ERROR;
    }
  }

  /**
   * Clean up partially initialized services.
   * @return {Promise<void>}
   * @private
   */
  async cleanup() {
    this.logger.info(JOINING_LOG_MSG.CLEANUP_START, {
      nodeId: this.nodeId,
      messageGroupServices: this.messageGroupServices.size,
      partitionServices: this.partitionServices.size,
    });
    this.stopJoiningLifecycleOwners();
    if (this.rebalanceCoordinator) {
      try {
        await this.rebalanceCoordinator.shutdown();
      } catch (error) {
        this.logger.warn('Node joining cleanup step failed', {
          nodeId: this.nodeId,
          step: 'rebalanceCoordinator.shutdown',
          error: error.message,
        });
      }
      this.rebalanceCoordinator = null;
    }
    LatencyTopologySetup.stop(this.latencyTopology);
    this.latencyTopology = null;

    // Shutdown replica state machine
    if (this.replicaStateMachine) {
      this.replicaStateMachine.stopTimeoutChecker();
      this.replicaStateMachine.clear();
      this.replicaStateMachine = null;
    }

    // Shutdown RPC client to cancel pending requests
    if (this.rpcClient) {
      await this.rpcClient.shutdown();
      this.rpcClient = null;
    }

    // Shutdown control plane services
    if (this.heartbeatService) {
      this.heartbeatService.stop();
      this.heartbeatService = null;
    }
    if (this.leaseService) {
      this.leaseService.stop();
      this.leaseService = null;
    }
    if (this.endpointService) {
      this.endpointService.stop();
      this.endpointService = null;
    }
    if (this.dispatchService) {
      this.dispatchService.stop();
      this.dispatchService = null;
    }

    // Shutdown replica handler
    if (this.replicaHandler) {
      this.replicaHandler.unregisterFromRouter(this.messageRouter);
      this.replicaHandler.shutdown();
      this.replicaHandler = null;
    }

    // Shutdown partition services
    for (const [replicaId, partition] of this.partitionServices) {
      try {
        if (partition.shutdown) {
          await partition.shutdown();
        }
        this.logger.debug(JOINING_LOG_MSG.PARTITION_CLEANED, {replicaId});
      } catch (err) {
        this.logger.warn(JOINING_LOG_MSG.PARTITION_CLEAN_FAILED, {
          replicaId,
          error: err.message,
        });
        // Continue best-effort cleanup to avoid leaving services running.
      }
    }
    this.partitionServices.clear();

    // Shutdown message group services
    for (const [replicaId, messageGroup] of this.messageGroupServices) {
      try {
        if (messageGroup.shutdown) {
          await messageGroup.shutdown();
        }
        this.logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_CLEANED, {replicaId});
      } catch (err) {
        this.logger.warn(JOINING_LOG_MSG.MESSAGE_GROUP_CLEAN_FAILED, {
          replicaId,
          error: err.message,
        });
        // Continue best-effort cleanup to avoid leaving services running.
      }
    }
    this.messageGroupServices.clear();

    // Clear transport
    if (this.transport && this.transport.shutdown && this.transport !== this.messageRouter) {
      await this.transport.shutdown();
    }
    this.transport = null;

    // Clear messageRouter
    if (this.messageRouter) {
      if (this.messageRouter.shutdown) {
        await this.messageRouter.shutdown();
      }
      this.messageRouter = null;
    }

    this.cdcIntegrationService = null;

    this.logger.info(JOINING_LOG_MSG.CLEANUP_COMPLETE, {nodeId: this.nodeId});
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
      // CRITICAL: All partitions created during node join are joining existing groups
      // They must start as learners to avoid disrupting existing leadership
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
        isJoiningExistingGroup: true, // Always true for joining nodes
      });

      await partition.initialize();

      this.partitionServices.set(options.replicaId, partition);

      const tableName = options.tableName;
      if (
        tableName &&
        messageGroupService &&
        DEFAULT_CACHE_SYNC_TABLES.has(tableName)
      ) {
        await messageGroupService.subscribeToCDC(tableName);

        partition.subscribeToCDC(async (cdcEvent) => {
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
        });

        this.logger.debug(JOINING_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
          tableName,
          partitionId: options.partitionId,
          replicaId: options.replicaId,
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
      systemTableCache,
      tablePolicyService: this.tablePolicyService,
      messageGroupServices: this.messageGroupServices,
      rebalanceCoordinator: this.rebalanceCoordinator,
    });

    this.heartbeatService = controlPlane.heartbeatService;
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
    for (const mgService of this.messageGroupServices.values()) {
      // Get the read-only wrapper for the query engine
      if (mgService.getReadOnlyCache) {
        systemTableCache = mgService.getReadOnlyCache();
      } else if (mgService.systemTableCache) {
        systemTableCache = mgService.systemTableCache;
      }
      break;
    }

    if (!systemTableCache) {
      systemTableCache = NodeService.getInstance().getSystemTableCache();
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
      duration: this.startTime ? Date.now() - this.startTime : NUM.ZERO,
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
