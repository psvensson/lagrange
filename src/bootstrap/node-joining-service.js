/**
 * Node Joining Service - Handles new node joining an existing cluster.
 *
 * Bootstrap Process:
 * 1. Contact seed node via HTTP to get bootstrap response
 * 2. Bootstrap response contains complete system table snapshots
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
 * Uses pull-based replica assignment and explicit lifecycle state transitions.
 * Requirements: 4.1, 4.6, 4.7, 7.8, 7.10, 7.11, 7.14
 */

import os from 'os';
import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {NodeService} from '../node/node-service.js';
import {MessageGroupService} from '../message-group/message-group-service.js';
import {MessageRouter} from '../transport/message-router.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from './message-group-assignment.js';
import {ReplicaHandler} from '../node/replica-handler.js';
import {ReplicaStateMachine} from '../node/replica-state-machine.js';
import {PartitionService} from '../partition/partition-service.js';
import {
  NodeLifecycleStateMachine,
  NodeState,
} from '../node/node-lifecycle-state-machine.js';
import {PullBasedReplicaAssigner} from '../rebalancer/pull-based-replica-assigner.js';
import {AssignmentEpochManager} from '../rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../rebalancer/assignment-epoch.js';
import {CDCIntegrationService} from '../cdc/cdc-integration-service.js';
import {SQLQueryEngine} from '../query/sql-query-engine.js';
import {CACHE_SYSTEM_TABLES} from '../cache/cache-constants.js';
import {TablePolicyService} from '../policy/table-policy-service.js';
import {RebalanceCoordinator} from '../rebalancer/rebalance-coordinator.js';
import {
  BOOTSTRAP_EVENT,
  BOOTSTRAP_SUBSYSTEM,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
  JOINING_PHASE,
} from './bootstrap-constants.js';
import {SYSTEM_TABLE_SCHEMAS} from './system-table-schemas-constants.js';
import {getMissingSystemServiceLeaders} from '../cache/leader-readiness-gate.js';
import {
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOINING_LOG_MSG,
  JOINING_SEED_PROPOSER,
} from './node-joining-constants.js';
import {ControlPlaneService} from '../control-plane/control-plane-service.js';
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
  NUM,
  PROTOCOL,
  SERVICE_TYPE,
  STATE,
  STRING,
  TABLES,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {ENTRYPOINT_DEFAULT} from '../constants/entrypoint.js';

const JoiningPhase = JOINING_PHASE;
const DEFAULT_JOINING_CONFIG = JOINING_DEFAULT;
const JoiningEvent = BOOTSTRAP_EVENT;

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

    // Replica handler for CREATE_REPLICA/REMOVE_REPLICA execution
    this.replicaHandler = null;

    // Replica state machine for tracking replica lifecycle states
    this.replicaStateMachine = null;

    // Control plane service for ordered registration and dispatch
    this.controlPlaneService = null;
    this.rebalanceCoordinator = null;

    // RPC client for control plane dispatch
    this.rpcClient = null;

    // CDC integration service for system table writes
    this.cdcIntegrationService = null;
    // Table policy service for partition placement decisions
    this.tablePolicyService = null;
    // Track system cache hydration state for rebalancer initialization
    this.systemCacheHydrated = false;
    // Track CDC subscription status
    this.cdcSubscriptionsActive = false;

    // Control plane target address for control messages
    this.controlPlaneTargetAddress = null;

    // Heartbeat timer
    this.heartbeatTimer = null;

    // Node lifecycle state machine for explicit state transitions
    // Requirements: 2.1, 2.2, 2.3, 2.4
    this.lifecycleStateMachine = new NodeLifecycleStateMachine({
      nodeId: this.nodeId,
      initialState: NodeState.STARTING,
    });

    // Pull-based replica assigner for deciding which replicas to pull
    // Requirements: 4.2, 4.3, 4.4, 4.5
    this.pullBasedAssigner = null;

    // Assignment epoch manager for epoch-based coordination
    // Requirements: 3.2, 3.6, 3.7, 3.8
    this.epochManager = null;

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

      // Phase 1: Contact seed node via HTTP
      await this.executePhase(
        JoiningPhase.CONTACTING_SEED,
        () => this.phaseContactSeed(),
      );

      // Phase 2: Connect to seed node via WebSocket for cross-node communication
      // Requirements: 8.1, 8.2 - Start server and self-connect BEFORE creating services
      await this.executePhase(
        JoiningPhase.CONNECTING_WEBSOCKET,
        () => this.phaseConnectWebSocket(),
      );

      // Transition to DISCOVERING state
      // Requirements: 2.7 - DISCOVERING state for receiving system cache
      this.lifecycleStateMachine.transition(NodeState.DISCOVERING);

      // Phase 3: Create or join message group based on assignment
      // Requirements: 8.3 - Services created AFTER self-connection established
      const assignment = this.bootstrapResponse.messageGroupAssignment;

      if (assignment.strategy === AssignmentStrategy.CREATE_SELF_HOSTED) {
        await this.executePhase(
          JoiningPhase.CREATING_MESSAGE_GROUP,
          () => this.phaseCreateSelfHostedMessageGroup(assignment),
        );
      } else if (assignment.strategy === AssignmentStrategy.MOVE_REPLICA) {
        await this.executePhase(
          JoiningPhase.JOINING_MESSAGE_GROUP,
          () => this.phaseJoinExistingMessageGroup(assignment),
        );
      }

      // Phase 4: Wait for leadership establishment
      await this.executePhase(
        JoiningPhase.WAITING_LEADERSHIP,
        () => this.phaseWaitForLeadership(),
      );

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

      this.initializeReplicaHandler();
      await this.initializeControlPlaneService();

      // Transition to JOINING state
      // Requirements: 2.8 - JOINING state for registering in cluster and proposing epoch
      this.lifecycleStateMachine.transition(NodeState.JOINING);

      // Phase 5: Query system partitions for cluster state
      // This includes registering the node in the cluster's nodes table
      await this.executePhase(
        JoiningPhase.QUERYING_STATE,
        () => this.phaseQuerySystemState(),
      );

      await this.signalReadyForReplicas();

      // Initialize pull-based assigner and propose epoch
      // Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
      await this.initializePullBasedAssignment();

      // Transition to SYNCING state
      // Requirements: 2.9 - SYNCING state for syncing replica data
      this.lifecycleStateMachine.transition(NodeState.SYNCING);

      // Sync replica data if we pulled any replicas
      // Requirements: 4.9, 4.10
      await this.syncPulledReplicas();

      // Transition to READY state
      // Requirements: 2.10 - READY state for accepting traffic
      this.lifecycleStateMachine.transition(NodeState.READY);

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
        pullBasedAssigner: this.pullBasedAssigner,
        epochManager: this.epochManager,
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
    assertCritical(this.messageRouter, JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    const targetAddress = assertCritical(
      this.controlPlaneTargetAddress || this.resolveControlPlaneTargetAddress(),
      JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING,
    );

    const readyMessage = {
      [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
      [ControlPlaneField.NODE_ID]: this.nodeId,
      [ControlPlaneField.NODE_ADDRESS]: this.nodeAddress,
      [ControlPlaneField.CAPABILITIES]: this.getNodeCapabilities(),
      [ControlPlaneField.STATE]: STATE.READY,
    };

    try {
      const result = await this.messageRouter.deliver(
        targetAddress,
        readyMessage,
        {timeout: NUM.THOUSAND},
      );

      if (result?.acknowledged) {
        this.logger.info(JOINING_LOG_MSG.READY_SIGNAL_SUCCESS, {
          nodeId: this.nodeId,
          targetAddress,
        });
        this.startHeartbeat();
      } else {
        this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_NOT_ACK, {
          nodeId: this.nodeId,
          targetAddress,
          error: result?.error,
        });
        throw new Error(JOINING_ERROR_MSG.READY_SIGNAL_NOT_ACK);
      }
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.READY_SIGNAL_FAILED, {
        nodeId: this.nodeId,
        targetAddress,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Start periodic heartbeats to the control plane.
   * @private
   */
  startHeartbeat() {
    if (this.heartbeatTimer) {
      return;
    }

    assertCritical(this.messageRouter, JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    const targetAddress = assertCritical(
      this.controlPlaneTargetAddress || this.resolveControlPlaneTargetAddress(),
      JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING,
    );

    const sendHeartbeat = async () => {
      // Resolve current control plane target address (may change on leadership change)
      const currentTargetAddress = this.resolveControlPlaneTargetAddress() || targetAddress;

      const heartbeatMessage = {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: this.nodeId,
        [ControlPlaneField.STATE]: STATE.READY,
        [ControlPlaneField.HEARTBEAT_AT]: Date.now(),
      };

      try {
        await this.messageRouter.deliver(currentTargetAddress, heartbeatMessage);
        // Update cached target address if it changed
        if (currentTargetAddress !== this.controlPlaneTargetAddress) {
          this.logger.info(JOINING_LOG_MSG.CONTROL_PLANE_TARGET_UPDATED, {
            nodeId: this.nodeId,
            oldTarget: this.controlPlaneTargetAddress,
            newTarget: currentTargetAddress,
          });
          this.controlPlaneTargetAddress = currentTargetAddress;
        }
      } catch (error) {
        // Log at WARN level so heartbeat failures are visible
        this.logger.warn(JOINING_LOG_MSG.HEARTBEAT_FAILED, {
          nodeId: this.nodeId,
          targetAddress: currentTargetAddress,
          error: error.message,
        });
      }
    };

    this.heartbeatTimer = setInterval(sendHeartbeat, this.config.heartbeatIntervalMs);
    // Unref to allow process exit when this is the only timer
    this.heartbeatTimer.unref();
    sendHeartbeat();
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
      await phaseFunction();

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

    try {
      const response = await this.httpPostImpl(bootstrapUrl, {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
      });

      if (!response.success) {
        throw new Error(this.buildBootstrapFailureError(response));
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
    } catch (error) {
      const parsedError = this.parseBootstrapError(error);
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

  /**
   * Parse bootstrap HTTP error bodies from the default HTTP client.
   * @param {Error} error
   * @return {Object|null}
   * @private
   */
  parseBootstrapError(error) {
    if (!error || typeof error.message !== TYPEOF.STRING) {
      return null;
    }

    const match = error.message.match(/^HTTP \\d+:\\s*(.*)$/s);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[1]);
    } catch (_parseError) {
      return null;
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

    // Stagger delay between replica creations to allow handlers to be registered
    const replicaStaggerDelayMs = this.config.replicaStaggerDelayMs;

    // Generate replica IDs
    const replicaIds = [];
    for (let i = NUM.ZERO; i < replicaCount; i++) {
      replicaIds.push(`${groupId}-r${i}`);
    }

    const peerAddresses = replicaIds.map(
      (replicaId) =>
        `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`,
    );

    // Track replicas created for this group to start elections after all are ready
    const groupReplicas = [];

    // Create all replicas on this node with staggered delays
    // Use deferElection to prevent election storms - elections start after all ready
    for (let i = NUM.ZERO; i < replicaIds.length; i++) {
      const replicaId = replicaIds[i];

      // Stagger replica creation to allow handlers to be registered
      // First replica starts immediately, subsequent replicas wait
      if (i > NUM.ZERO) {
        await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
      }

      const messageGroup = new MessageGroupService({
        groupId,
        replicaId,
        nodeId: this.nodeId,
        replicaIds,
        peerAddresses,
        // Use MessageRouter directly for all communication
        transport: this.messageRouter,
        // Defer election until all replicas are created to prevent election storms
        deferElection: true,
      });

      // Register with MessageRouter using unified address format
      // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
      const unifiedAddress = `${this.nodeId}${ADDRESS.SEPARATOR}` +
        `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`;
      this.messageRouter.register(unifiedAddress, (envelope) => {
        return messageGroup.receiveMessage(envelope);
      });

      await messageGroup.initialize();

      this.messageGroupServices.set(replicaId, messageGroup);
      groupReplicas.push(messageGroup);

      this.logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_REPLICA_CREATED, {
        groupId,
        replicaId,
        replicaIndex: i,
        nodeId: this.nodeId,
      });
    }

    // All replicas for this group are created and registered
    // Now start elections - they can communicate with each other
    this.logger.debug(JOINING_LOG_MSG.MESSAGE_GROUP_ELECTIONS_START, {
      groupId,
      replicaCount: groupReplicas.length,
    });

    for (const messageGroup of groupReplicas) {
      messageGroup.startElection();
    }

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
    return null;
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

    const messageGroup = new MessageGroupService({
      groupId,
      replicaId: replicaId,
      nodeId: this.nodeId,
      replicaIds: allReplicaIds,
      // Use MessageRouter directly for all communication
      transport: this.messageRouter,
      // Use unified peer addresses for cross-node Raft communication
      peerAddresses: peerAddresses || [],
    });

    // Register with MessageRouter using unified address format
    // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
    const unifiedAddress = `${this.nodeId}${ADDRESS.SEPARATOR}` +
      `${ENTITY_TYPE.MESSAGE_GROUP}${ADDRESS.SEPARATOR}${replicaId}`;
    this.messageRouter.register(unifiedAddress, (envelope) => {
      this.logger.debug(JOINING_LOG_MSG.JOIN_MESSAGE_RECEIVED, {
        address: unifiedAddress,
        envelopeType: envelope?.type || envelope?.payload?.type,
        from: envelope?.from || envelope?.payload?.address,
      });
      return messageGroup.receiveMessage(envelope);
    });

    this.logger.info(JOINING_LOG_MSG.JOIN_HANDLER_REGISTERED, {
      unifiedAddress,
      nodeId: this.nodeId,
    });

    await messageGroup.initialize();

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

    this.messageGroupServices.set(replicaId, messageGroup);

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
      status: STATE.ACTIVE,
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

    try {
      const response = await this.httpPostImpl(registerUrl, serviceData);

      if (!response.success) {
        this.logger.error(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_NON_SUCCESS, {
          nodeId: this.nodeId,
          replicaId,
          error: response.error,
        });
        throw new Error(response.error || JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED);
      } else {
        this.logger.info(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTERED, {
          nodeId: this.nodeId,
          replicaId,
          groupId,
        });
      }
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_FAILED, {
        nodeId: this.nodeId,
        replicaId,
        error: error.message,
      });
      throw error;
    }
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

    this.logger.debug(JOINING_LOG_MSG.WAITING_LEADERSHIP, {
      nodeId: this.nodeId,
      timeoutMs,
      messageGroupCount: this.messageGroupServices.size,
    });

    while (Date.now() - startTime < timeoutMs) {
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

      // Wait with exponential backoff
      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    // Timeout - fail joining
    const leadershipTimeout = JOINING_ERROR_MSG.LEADERSHIP_TIMEOUT;
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
      const missingCount = missing.missingPartitionLeaders.length +
        missing.missingMessageGroupLeaders.length +
        missing.missingPartitionLeaderNodes.length +
        missing.missingMessageGroupLeaderNodes.length;

      if (missingCount === NUM.ZERO) {
        return;
      }

      await this.sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }

    const leadershipTimeout = JOINING_ERROR_MSG.LEADERSHIP_TIMEOUT;
    throw new Error(leadershipTimeout(timeoutMs));
  }

  /**
   * Find missing service leaders using system table cache.
   * @param {Object} systemTableCache - System table cache.
   * @return {Object} Missing leader lists.
   * @private
   */
  getMissingSystemServiceLeaders(systemTableCache) {
    return getMissingSystemServiceLeaders(systemTableCache, {
      requireLeaderNodeId: true,
    });
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
   * @return {string|null} Target address or null.
   * @private
   */
  resolveControlPlaneTargetAddress() {
    const assignment = this.bootstrapResponse?.messageGroupAssignment;
    if (!assignment) {
      return null;
    }

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

    const candidates = [
      ...(Array.isArray(assignment.peerAddresses) ? assignment.peerAddresses : []),
      ...(Array.isArray(assignment.replicaAddresses) ? assignment.replicaAddresses : []),
    ].filter(Boolean);

    const parseAddress = (addr) => {
      const m = addr.match(/^([^/]+)\/message-group\/(.+)$/);
      return m ? {nodeId: m[NUM.ONE], replicaId: m[NUM.TWO]} : null;
    };

    const prefer = candidates.find((addr) => {
      const parsed = parseAddress(addr);
      if (!parsed) return false;
      if (seedNodeId && parsed.nodeId !== seedNodeId) return false;
      if (replicaToMove && parsed.replicaId === replicaToMove) return false;
      return true;
    });
    if (prefer) return prefer;

    const nextBest = candidates.find((addr) => {
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

    // Create MessageRouter for unified local/remote message routing
    // Requirements: 8.1, 8.2 - Initialize MessageRouter before creating services
    this.messageRouter = new MessageRouter({
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      wsPort: wsPort,
      identifyPayload,
    });

    // Set up resolver to extract nodeId from address pattern "${nodeId}/..."
    this.messageRouter.setServiceNodeResolver((address) => {
      const match = address.match(/^([^/]+)\//);
      return match ? match[NUM.ONE] : null;
    });

    // Requirements: 8.1, 8.2, 8.4 - Start server first, then establish self-connection
    // If wsPort is specified, start server and establish self-connection
    // This ensures all messages (local and remote) go through WebSocket
    if (wsPort) {
      try {
        // Requirements: 8.1 - Start WebSocket server first
        await this.messageRouter.initialize({startServer: true});

        this.logger.info(JOINING_LOG_MSG.WS_SELF_CONNECTED, {
          nodeId: this.nodeId,
          wsPort: wsPort,
          hasSelfConnection: this.messageRouter.hasSelfConnection(),
        });
      } catch (error) {
        // Requirements: 8.4 - Fail joining if self-connection fails
        this.logger.error(JOINING_LOG_MSG.ROUTER_INIT_FAILED, {
          nodeId: this.nodeId,
          wsPort: wsPort,
          error: error.message,
          stack: error.stack,
        });
        const routerInitFailed = JOINING_ERROR_MSG.ROUTER_INIT_FAILED;
        throw new Error(routerInitFailed(error.message));
      }
    } else {
      // No wsPort - initialize without server (for testing or single-node scenarios)
      try {
        await this.messageRouter.initialize({startServer: false});
      } catch (error) {
        this.logger.error(JOINING_LOG_MSG.ROUTER_INIT_FAILED, {
          nodeId: this.nodeId,
          error: error.message,
          stack: error.stack,
        });
        const routerInitFailed = JOINING_ERROR_MSG.ROUTER_INIT_FAILED;
        throw new Error(routerInitFailed(error.message));
      }
    }

    // Use MessageRouter directly for all services
    // MessageRouter handles both local and remote message delivery
    this.transport = this.messageRouter;

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

    const targetAddress = this.controlPlaneTargetAddress ||
      this.resolveControlPlaneTargetAddress();
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
      // WebSocket port = REST port + WS_PORT_OFFSET (1000)
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
   *   * indices, config, logs, live_queries, contexts, code - additional system metadata
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
      });
    }

    const systemTableCache = assertCritical(
      nodeService.getSystemTableCache(),
      JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED,
    );

    // Hydrate each system table from snapshots
    const systemTables = CACHE_SYSTEM_TABLES;

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
        systemTableCache.applySystemTableChange(
          tableName,
          CDC_OPERATION.INSERT,
          record,
        );
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

      // Subscribe to CDC events to keep cache updated
      await this.subscribeToCDCEvents();
    } catch (error) {
      this.logger.error(JOINING_LOG_MSG.STATE_QUERY_HYDRATION_FAILED, {
        nodeId: this.nodeId,
        error: error.message,
      });
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

    const queryEngine = assertCritical(
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

    // Build INSERT SQL query
    const sql = `INSERT INTO nodes (
      node_id,
      node_address,
      cpu_cores,
      memory_mb,
      disk_gb,
      cpu_usage_percent,
      memory_usage_percent,
      disk_usage_percent,
      status,
      ws_connection_state,
      capabilities,
      last_heartbeat,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      this.nodeId,
      this.nodeAddress,
      cpuCores,
      totalMemoryMb,
      diskGb,
      NUM.ZERO, // cpu_usage_percent
      NUM.ZERO, // memory_usage_percent
      NUM.ZERO, // disk_usage_percent
      STATE.ACTIVE,
      STATE.CONNECTED,
      JSON.stringify([]), // capabilities
      now, // last_heartbeat
      now, // created_at
    ];

    try {
      const result = await queryEngine.executeQuery(sql, params);

      if (!result.success) {
        throw new Error(`Failed to register node: ${result.error}`);
      }

      this.logger.info('Node registered in cluster', {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        cpuCores,
        memoryMb: totalMemoryMb,
        diskGb,
      });

      // Register WebSocket endpoint in node_endpoints table
      // Requirements: 8.2 - Node registration creates endpoint
      await this.registerNodeEndpoint(queryEngine, now);
    } catch (error) {
      this.logger.error('Failed to register node in cluster', {
        nodeId: this.nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Register the WebSocket endpoint for this node in the node_endpoints table.
   * Requirements: 8.2 - Node registration creates endpoint in node_endpoints table.
   * @param {Object} queryEngine - SQL query engine instance.
   * @param {number} now - Current timestamp.
   * @return {Promise<void>}
   * @private
   */
  async registerNodeEndpoint(queryEngine, now) {
    this.logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERING, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

    const endpointId = `ep-${this.nodeId}-ws`;

    const endpointSql = `INSERT INTO ${TABLES.NODE_ENDPOINTS} (
      ${COLUMN.ENDPOINT_ID},
      ${COLUMN.NODE_ID},
      ${COLUMN.TRANSPORT_TYPE},
      ${COLUMN.ADDRESS},
      ${COLUMN.PRIORITY},
      ${COLUMN.METADATA},
      ${COLUMN.STATUS},
      ${COLUMN.CREATED_AT},
      ${COLUMN.UPDATED_AT}
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const endpointParams = [
      endpointId,
      this.nodeId,
      TRANSPORT_TYPE.WEBSOCKET,
      this.nodeAddress,
      NUM.ZERO, // priority (0 = highest)
      JSON.stringify({}), // metadata
      ENDPOINT_STATUS.ACTIVE,
      now,
      now,
    ];

    try {
      const endpointResult = await queryEngine.executeQuery(endpointSql, endpointParams);

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
   * Subscribe to CDC events for all system tables.
   * This keeps the system cache updated as cluster state changes.
   * Requirements: 4.1, 4.2, 4.3 - CDC subscriptions keep cache updated.
   * @return {Promise<void>}
   * @private
   */
  async subscribeToCDCEvents() {
    if (!this.cdcIntegrationService) {
      const error = new Error(
        JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
          'all system tables',
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
      const eventTypes = ['insert', 'update', 'delete', 'upsert'];
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
   * Initialize pull-based replica assignment.
   * Creates PullBasedReplicaAssigner and AssignmentEpochManager,
   * analyzes current epoch, and proposes new assignments if needed.
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
   * @return {Promise<void>}
   * @private
   */
  async initializePullBasedAssignment() {
    this.logger.debug(JOINING_LOG_MSG.PULL_ASSIGN_INIT, {
      nodeId: this.nodeId,
    });

    // Create PullBasedReplicaAssigner
    // Requirements: 4.2, 4.3, 4.4, 4.5
    this.pullBasedAssigner = new PullBasedReplicaAssigner({
      nodeId: this.nodeId,
      maxReplicasToPull: NUM.TEN,
      syncRetryAttempts: NUM.THREE,
      syncRetryDelayMs: NUM.THOUSAND,
      replicaHandler: this.replicaHandler,
      rpcClient: this.rpcClient,
    });

    // Create AssignmentEpochManager
    // Requirements: 3.2, 3.6, 3.7, 3.8
    this.epochManager = new AssignmentEpochManager({
      nodeId: this.nodeId,
    });

    // Get current epoch from bootstrap response or create initial
    const epochData = this.bootstrapResponse?.currentEpoch;
    if (epochData) {
      // Apply epoch from seed node
      const epoch = typeof epochData === TYPEOF.STRING ?
        AssignmentEpoch.fromJSON(epochData) :
        (epochData instanceof AssignmentEpoch ?
          epochData :
          AssignmentEpoch.fromObject({
            epoch: epochData.epoch,
            assignments: epochData.assignments || {},
            timestamp: epochData.timestamp || new Date().toISOString(),
            proposedBy: epochData.proposedBy || JOINING_SEED_PROPOSER.DEFAULT,
          }));
      this.epochManager.initialize(epoch);
    } else {
      // Initialize with empty epoch
      this.epochManager.initialize();
    }

    // Get list of ready nodes from bootstrap response
    const readyNodes = this.bootstrapResponse?.readyNodes || [];

    // If no ready nodes provided, we can't do pull-based assignment
    if (readyNodes.length === NUM.ZERO) {
      this.logger.error(JOINING_LOG_MSG.READY_NODES_MISSING, {
        nodeId: this.nodeId,
      });
      throw new Error(JOINING_ERROR_MSG.READY_NODES_REQUIRED);
    }

    // Get table policies from bootstrap response
    const tablePolicies = new Map();
    const policies = this.bootstrapResponse?.tablePolicies || {};
    for (const [tableName, policy] of Object.entries(policies)) {
      tablePolicies.set(tableName, policy);
    }

    // Analyze current epoch and propose new assignments
    // Requirements: 4.2, 4.3, 4.4
    const currentEpoch = this.epochManager.getCurrentEpoch();
    const proposal = this.pullBasedAssigner.analyzeAndPropose(
      currentEpoch,
      this.nodeId,
      readyNodes,
      tablePolicies,
    );

    if (!proposal.success) {
      this.logger.error(JOINING_LOG_MSG.PULL_ASSIGN_FAILED, {
        nodeId: this.nodeId,
        error: proposal.error,
        violations: proposal.violations,
      });
      throw new Error(JOINING_ERROR_MSG.pullAssignFailed(proposal.error));
    }

    if (!proposal.proposedAssignments) {
      this.logger.debug(JOINING_LOG_MSG.REBALANCE_NOT_NEEDED, {
        nodeId: this.nodeId,
        reason: proposal.reason,
      });
      return;
    }

    // Propose new epoch with updated assignments
    // Requirements: 4.6
    const epochResult = this.epochManager.proposeEpoch(
      currentEpoch.epoch,
      proposal.proposedAssignments,
    );

    if (!epochResult.success) {
      this.logger.error(JOINING_LOG_MSG.EPOCH_PROPOSAL_FAILED, {
        nodeId: this.nodeId,
        error: epochResult.error,
      });
      throw new Error(JOINING_ERROR_MSG.epochProposalFailed(epochResult.error));
    }

    this.logger.info(JOINING_LOG_MSG.EPOCH_PROPOSED, {
      nodeId: this.nodeId,
      previousEpoch: currentEpoch.epoch,
      newEpoch: epochResult.epoch.epoch,
      replicasToPull: proposal.replicasToPull.length,
    });

    // Create local replicas for pulled partitions
    // Requirements: 4.7
    const partitionIds = proposal.replicasToPull.map((r) => r.partitionId);
    if (partitionIds.length > NUM.ZERO) {
      const createResult = await this.pullBasedAssigner.createLocalReplicas(
        partitionIds,
      );

      this.logger.info(JOINING_LOG_MSG.LOCAL_REPLICAS_CREATED, {
        nodeId: this.nodeId,
        created: createResult.created.length,
        failed: createResult.failed.length,
      });

      // Store replicas to pull for syncing phase
      this._replicasToPull = proposal.replicasToPull;

      if (createResult.failed.length > NUM.ZERO) {
        throw new Error(
          JOINING_ERROR_MSG.localReplicaCreateFailed(
            createResult.failed.join(', '),
          ),
        );
      }
    }
  }

  /**
   * Sync data for pulled replicas from source nodes.
   * Requirements: 4.9, 4.10
   * @return {Promise<void>}
   * @private
   */
  async syncPulledReplicas() {
    if (!this._replicasToPull || this._replicasToPull.length === NUM.ZERO) {
      this.logger.debug(JOINING_LOG_MSG.NO_REPLICAS_TO_SYNC, {
        nodeId: this.nodeId,
      });
      return;
    }

    this.logger.debug(JOINING_LOG_MSG.SYNCING_REPLICAS, {
      nodeId: this.nodeId,
      replicaCount: this._replicasToPull.length,
    });

    const currentEpoch = this.epochManager.getCurrentEpoch();
    const syncFailures = [];

    for (const {partitionId, fromNode} of this._replicasToPull) {
      // Get all source nodes for this partition (excluding this node)
      const sourceNodes = currentEpoch.getPartitionAssignments(partitionId) || [];
      const validSources = sourceNodes.filter((n) => n !== this.nodeId);

      // Prefer the original source node, but fall back to others
      const orderedSources = [fromNode, ...validSources.filter((n) => n !== fromNode)];

      const syncResult = await this.pullBasedAssigner.syncReplicaData(
        partitionId,
        orderedSources,
      );

      if (syncResult.success) {
        this.logger.debug(JOINING_LOG_MSG.REPLICA_SYNC_SUCCESS, {
          nodeId: this.nodeId,
          partitionId,
          syncedFrom: syncResult.syncedFrom,
        });
      } else {
        this.logger.error(JOINING_LOG_MSG.REPLICA_SYNC_FAILED, {
          nodeId: this.nodeId,
          partitionId,
          error: syncResult.error,
        });
        syncFailures.push({partitionId, error: syncResult.error});
      }
    }

    // Clear the replicas to pull list
    this._replicasToPull = null;

    this.logger.info(JOINING_LOG_MSG.REPLICA_SYNC_COMPLETE, {
      nodeId: this.nodeId,
    });

    if (syncFailures.length > NUM.ZERO) {
      const failureSummary = syncFailures.map((failure) =>
        `${failure.partitionId}: ${failure.error}`,
      ).join(', ');
      throw new Error(
        JOINING_ERROR_MSG.replicaSyncFailed('replica_sync', failureSummary),
      );
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
        const errorBody = await response.text();
        const httpStatusError = JOINING_ERROR_MSG.HTTP_STATUS;
        throw new Error(httpStatusError(response.status, errorBody));
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === JOINING_ERROR_NAME.ABORT) {
        const httpTimeoutError = JOINING_ERROR_MSG.HTTP_TIMEOUT;
        throw new Error(httpTimeoutError(this.config.httpTimeoutMs));
      }

      throw error;
    }
  }

  /**
   * Handle joining failure.
   * @param {Error} error - The error that caused failure.
   * @return {Object} Failure result.
   * @private
   */
  async handleJoiningFailure(error) {
    this.phase = JoiningPhase.FAILED;
    this.lastError = error;
    const duration = Date.now() - this.startTime;

    this.logger.error(JOINING_LOG_MSG.JOIN_FAILED, {
      nodeId: this.nodeId,
      phase: this.phase,
      duration,
      error: error.message,
      stack: error.stack,
    });

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

    // Clear pull-based assigner
    this.pullBasedAssigner = null;

    // Clear epoch manager
    this.epochManager = null;

    // Clear replicas to pull list
    this._replicasToPull = null;

    // Shutdown replica state machine
    if (this.replicaStateMachine) {
      this.replicaStateMachine.stopTimeoutChecker();
      this.replicaStateMachine.clear();
      this.replicaStateMachine = null;
    }

    // Stop heartbeats
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Shutdown RPC client to cancel pending requests
    if (this.rpcClient) {
      await this.rpcClient.shutdown();
      this.rpcClient = null;
    }

    // Shutdown control plane service
    if (this.controlPlaneService) {
      this.controlPlaneService.shutdown();
      this.controlPlaneService = null;
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
        throw err;
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
        throw err;
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

    this.replicaStateMachine = new ReplicaStateMachine({
      nodeId: this.nodeId,
      cdcIntegrationService: cdcIntegrationService,
    });

    this.replicaStateMachine.startTimeoutChecker();

    const createPartitionService = async (options) => {
      const cacheForPartition = this.systemCacheHydrated ? systemTableCache : null;
      // CRITICAL: All partitions created during node join are joining existing groups
      // They must start as learners to avoid disrupting existing leadership
      const partition = new PartitionService({
        ...options,
        transport: this.transport,
        messageGroupService: messageGroupService,
        messageRouter: this.messageRouter,
        replicaStateMachine: this.replicaStateMachine,
        systemTableCache: cacheForPartition,
        cdcIntegrationService: cdcIntegrationService,
        tablePolicyService: this.tablePolicyService,
        isJoiningExistingGroup: true, // Always true for joining nodes
      });

      await partition.initialize();

      this.partitionServices.set(options.replicaId, partition);

      const tableName = options.tableName;
      if (tableName && messageGroupService) {
        await messageGroupService.subscribeToCDC(tableName);

        partition.subscribeToCDC(async (cdcEvent) => {
          if (cdcEvent.tableName === tableName) {
            this.logger.debug(JOINING_LOG_MSG.CDC_EVENT_RECEIVED, {
              tableName: cdcEvent.tableName,
              operation: cdcEvent.operation,
              partitionId: options.partitionId,
              replicaId: options.replicaId,
            });
            await messageGroupService.applyCDCEvent(
              cdcEvent.tableName,
              cdcEvent.operation,
              cdcEvent.data,
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

    this.replicaHandler = new ReplicaHandler({
      nodeId: this.nodeId,
      systemTableCache: systemTableCache,
      cdcIntegrationService: cdcIntegrationService,
      createPartitionService: createPartitionService,
      dataDir: this.dataDir,
    });

    this.replicaHandler.initialize();
    this.replicaHandler.registerWithRouter(this.messageRouter, {
      rpcClient: this.rpcClient,
    });

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
    if (this.controlPlaneService) {
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

    if (!this.rebalanceCoordinator) {
      this.rebalanceCoordinator = new RebalanceCoordinator({
        nodeId: this.nodeId,
        systemTableCache,
        cdcIntegrationService,
        messageRouter: this.messageRouter,
        tablePolicyService: this.tablePolicyService,
        sqlQueryEngine: cdcIntegrationService.sqlQueryEngine,
      });
      this.rebalanceCoordinator.initialize();
    }

    for (const messageGroupService of this.messageGroupServices.values()) {
      assertCritical(
        messageGroupService && typeof messageGroupService.subscribeToCDC === TYPEOF.FUNCTION,
        JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
          STRING.UNKNOWN,
          'subscribeToCDC not available',
        ),
      );

      for (const schema of SYSTEM_TABLE_SCHEMAS) {
        try {
          await messageGroupService.subscribeToCDC(schema.tableName);
        } catch (error) {
          this.logger.error(JOINING_LOG_MSG.CDC_SUBSCRIPTION_FAILED, {
            nodeId: this.nodeId,
            tableName: schema.tableName,
            error: error.message,
          });
          throw new Error(
            JOINING_ERROR_MSG.controlPlaneCdcSubscribeFailed(
              schema.tableName,
              error.message,
            ),
          );
        }
      }
    }

    this.controlPlaneService = new ControlPlaneService({
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      messageRouter: this.messageRouter,
      cdcIntegrationService: cdcIntegrationService,
      systemTableCache: systemTableCache,
      rebalanceCoordinator: this.rebalanceCoordinator,
    });

    this.controlPlaneService.initialize();
    for (const messageGroupService of this.messageGroupServices.values()) {
      this.controlPlaneService.attachMessageGroupService(messageGroupService);
    }

    this.controlPlaneService.startLeaseSweep();
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

    assertCritical(systemTableCache, JOINING_ERROR_MSG.STATE_QUERY_CACHE_REQUIRED);
    assertCritical(this.messageRouter, JOINING_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);

    // Create SQL query engine with message router for transparent remote routing
    // The query engine will route queries to remote partitions via message router
    // System cache will be populated during phaseQuerySystemState()
    const sqlQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: this.messageRouter,
      nodeId: this.nodeId,
    });

    // Create and initialize the CDC integration service
    // Uses SQL query engine for transparent routing to partition leaders
    const cdcIntegrationService = new CDCIntegrationService({
      nodeId: this.nodeId,
      sqlQueryEngine,
      systemTableCache,
    });
    cdcIntegrationService.initialize();
    cdcIntegrationService.setSystemTableCache(systemTableCache);

    // Set message router for mesh connectivity on node join
    if (this.messageRouter) {
      cdcIntegrationService.setMessageRouter(this.messageRouter);
    }

    for (const messageGroup of this.messageGroupServices.values()) {
      if (messageGroup.setCdcIntegrationService) {
        messageGroup.setCdcIntegrationService(cdcIntegrationService);
      }
    }

    this.cdcIntegrationService = cdcIntegrationService;
    return cdcIntegrationService;
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
   * Get the pull-based replica assigner.
   * @return {PullBasedReplicaAssigner|null} The assigner or null if not initialized.
   */
  getPullBasedAssigner() {
    return this.pullBasedAssigner;
  }

  /**
   * Get the assignment epoch manager.
   * @return {AssignmentEpochManager|null} The epoch manager or null if not initialized.
   */
  getEpochManager() {
    return this.epochManager;
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
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export {NodeJoiningService, JoiningPhase, DEFAULT_JOINING_CONFIG, NodeState};
