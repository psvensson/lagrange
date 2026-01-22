/**
 * Node Joining Service - Handles new node joining an existing cluster.
 * Contacts seed node via HTTP, creates/joins message group, queries system state.
 * Requirements: 7.8, 7.10, 7.11, 7.14
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {NodeService} from '../node/node-service.js';
import {MessageGroupService} from '../message-group/message-group-service.js';
import {MessageRouter} from '../transport/message-router.js';
import {AssignmentStrategy} from './message-group-assignment.js';
import {ReplicaLifecycleManager} from '../node/replica-lifecycle-manager.js';
import {ReplicaStateMachine} from '../node/replica-state-machine.js';
import {PartitionService} from '../partition/partition-service.js';

/**
 * Joining phases enumeration.
 */
const JoiningPhase = {
  NOT_STARTED: 'not_started',
  CONTACTING_SEED: 'contacting_seed',
  CREATING_MESSAGE_GROUP: 'creating_message_group',
  JOINING_MESSAGE_GROUP: 'joining_message_group',
  WAITING_LEADERSHIP: 'waiting_leadership',
  CONNECTING_WEBSOCKET: 'connecting_websocket',
  QUERYING_STATE: 'querying_state',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

/**
 * Default joining configuration.
 */
const DEFAULT_JOINING_CONFIG = {
  httpTimeoutMs: 10000,
  leadershipWaitTimeoutMs: 30000,
  leadershipWaitInitialDelayMs: 100,
  leadershipWaitMaxDelayMs: 5000,
  leadershipWaitBackoffMultiplier: 2,
  wsPort: null, // WebSocket port for this node (null = no server)
};

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
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || uuidv4();
    this.nodeAddress = options.nodeAddress || null;
    this.seedNodeAddress = options.seedNodeAddress || null;
    this.seedNodeWsAddress = options.seedNodeWsAddress || null;
    this.wsPort = options.wsPort || null;
    this.dataDir = options.dataDir || './data';
    this.config = {...DEFAULT_JOINING_CONFIG, ...options.config};

    // Services created during joining
    this.messageGroupServices = new Map();
    this.partitionServices = new Map();
    this.transport = null;
    // MessageRouter for unified local/remote message routing
    this.messageRouter = null;

    // Replica lifecycle manager for handling CREATE_REPLICA/REMOVE_REPLICA
    this.replicaLifecycleManager = null;

    // Replica state machine for tracking replica lifecycle states
    this.replicaStateMachine = null;

    // Bootstrap response from seed node
    this.bootstrapResponse = null;

    // Joining state
    this.phase = JoiningPhase.NOT_STARTED;
    this.startTime = null;
    this.phaseStartTime = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('node-joining') : console;

    // Error tracking
    this.lastError = null;
  }

  /**
   * Execute the full joining process.
   * Requirements: 8.1, 8.2, 8.3 - Bootstrap sequence: server → self-connect → services.
   * @return {Promise<Object>} Joining result.
   */
  async join() {
    this.startTime = Date.now();

    this.logger.info('Starting node joining process', {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      seedNodeAddress: this.seedNodeAddress,
    });

    try {
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

      // Initialize ReplicaLifecycleManager after message group is ready
      this.initializeReplicaLifecycleManager();

      // Phase 5: Query system partitions for cluster state
      await this.executePhase(
        JoiningPhase.QUERYING_STATE,
        () => this.phaseQuerySystemState(),
      );

      // Joining complete
      this.phase = JoiningPhase.COMPLETE;
      const duration = Date.now() - this.startTime;

      this.logger.info('Node joining completed successfully', {
        nodeId: this.nodeId,
        duration,
        messageGroupCount: this.messageGroupServices.size,
      });

      this.emit('complete', {
        nodeId: this.nodeId,
        duration,
        messageGroupServices: this.messageGroupServices,
        transport: this.transport,
        messageRouter: this.messageRouter,
      });

      return {
        success: true,
        nodeId: this.nodeId,
        duration,
        messageGroupServices: this.messageGroupServices,
        partitionServices: this.partitionServices,
        replicaLifecycleManager: this.replicaLifecycleManager,
        replicaStateMachine: this.replicaStateMachine,
        transport: this.transport,
        messageRouter: this.messageRouter,
        bootstrapResponse: this.bootstrapResponse,
      };
    } catch (error) {
      return this.handleJoiningFailure(error);
    }
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

    this.logger.info('Starting joining phase', {
      nodeId: this.nodeId,
      phase: phaseName,
    });

    this.emit('phaseStart', {
      phase: phaseName,
      nodeId: this.nodeId,
    });

    try {
      await phaseFunction();

      const phaseDuration = Date.now() - this.phaseStartTime;

      this.logger.info('Joining phase completed', {
        nodeId: this.nodeId,
        phase: phaseName,
        duration: phaseDuration,
      });

      this.emit('phaseComplete', {
        phase: phaseName,
        nodeId: this.nodeId,
        duration: phaseDuration,
      });
    } catch (error) {
      const phaseDuration = Date.now() - this.phaseStartTime;

      this.logger.error('Joining phase failed', {
        nodeId: this.nodeId,
        phase: phaseName,
        duration: phaseDuration,
        error: error.message,
        stack: error.stack,
      });

      this.emit('phaseFailed', {
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
      throw new Error('Seed node address is required');
    }

    const bootstrapUrl = `${this.seedNodeAddress}/bootstrap`;

    this.logger.debug('Contacting seed node', {
      nodeId: this.nodeId,
      bootstrapUrl,
    });

    try {
      const response = await this.httpPost(bootstrapUrl, {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
      });

      if (!response.success) {
        throw new Error(response.error || 'Bootstrap request failed');
      }

      this.bootstrapResponse = response;

      this.logger.debug('Received bootstrap response', {
        nodeId: this.nodeId,
        seedNodeId: response.seedNodeId,
        strategy: response.messageGroupAssignment?.strategy,
      });
    } catch (error) {
      this.logger.error('Failed to contact seed node', {
        nodeId: this.nodeId,
        bootstrapUrl,
        error: error.message,
      });
      throw new Error(`Failed to contact seed node: ${error.message}`);
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
    const replicaCount = assignment.replicaCount || 3;

    this.logger.debug('Creating self-hosted message group', {
      nodeId: this.nodeId,
      groupId,
      replicaCount,
    });

    // Requirements: 8.3 - MessageRouter should already be initialized in phaseConnectWebSocket
    if (!this.messageRouter) {
      throw new Error('MessageRouter must be initialized before creating message groups');
    }

    // Stagger delay between replica creations to allow handlers to be registered
    const replicaStaggerDelayMs = 50;

    // Generate replica IDs
    const replicaIds = [];
    for (let i = 0; i < replicaCount; i++) {
      replicaIds.push(`${groupId}-r${i}`);
    }

    // Track replicas created for this group to start elections after all are ready
    const groupReplicas = [];

    // Create all replicas on this node with staggered delays
    // Use deferElection to prevent election storms - elections start after all ready
    for (let i = 0; i < replicaIds.length; i++) {
      const replicaId = replicaIds[i];

      // Stagger replica creation to allow handlers to be registered
      // First replica starts immediately, subsequent replicas wait
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, replicaStaggerDelayMs));
      }

      const messageGroup = new MessageGroupService({
        groupId,
        replicaId,
        nodeId: this.nodeId,
        replicaIds,
        // Use MessageRouter directly for all communication
        transport: this.messageRouter,
        // Defer election until all replicas are created to prevent election storms
        deferElection: true,
      });

      // Register with MessageRouter using unified address format
      // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
      const unifiedAddress = `${this.nodeId}/message-group/${replicaId}`;
      this.messageRouter.register(unifiedAddress, (envelope) => {
        return messageGroup.receiveMessage(envelope);
      });

      await messageGroup.initialize();

      this.messageGroupServices.set(replicaId, messageGroup);
      groupReplicas.push(messageGroup);

      this.logger.debug('Message group replica created', {
        groupId,
        replicaId,
        replicaIndex: i,
        nodeId: this.nodeId,
      });
    }

    // All replicas for this group are created and registered
    // Now start elections - they can communicate with each other
    this.logger.debug('Starting elections for message group replicas', {
      groupId,
      replicaCount: groupReplicas.length,
    });

    for (const messageGroup of groupReplicas) {
      messageGroup.startElection();
    }

    this.logger.info('Self-hosted message group created', {
      nodeId: this.nodeId,
      groupId,
      replicaCount: this.messageGroupServices.size,
      hasMessageRouter: !!this.messageRouter,
    });
  }

  /**
   * Get the leader message group service for sending lifecycle messages.
   * Returns the first message group service that is a leader, or any available service.
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
    // Fall back to any available service
    for (const service of this.messageGroupServices.values()) {
      if (service) {
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

    this.logger.info('[JOIN-DEBUG] phaseJoinExistingMessageGroup - received assignment', {
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
      throw new Error('MessageRouter must be initialized before creating message groups');
    }

    // Generate new replica ID for this node
    const newReplicaId = `${groupId}-r${Date.now()}`;

    // Create message group service instance
    // Note: When joining as a single replica (e.g., during bootstrap testing),
    // the replica will become leader immediately due to single-replica check.
    // In production with real peers, the replica would receive heartbeats
    // from the existing leader.
    const allReplicaIds = [...(existingPeerIds || []), newReplicaId];

    this.logger.info('[JOIN-DEBUG] Creating MessageGroupService with peers', {
      nodeId: this.nodeId,
      groupId,
      newReplicaId,
      allReplicaIds,
      peerAddresses: peerAddresses || [],
      hasMessageRouter: !!this.messageRouter,
      messageRouterConnections: this.messageRouter?.getConnectedNodes?.() || 'N/A',
    });

    const messageGroup = new MessageGroupService({
      groupId,
      replicaId: newReplicaId,
      nodeId: this.nodeId,
      replicaIds: allReplicaIds,
      // Use MessageRouter directly for all communication
      transport: this.messageRouter,
      // Use unified peer addresses for cross-node Raft communication
      peerAddresses: peerAddresses || [],
    });

    // Register with MessageRouter using unified address format
    // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
    const unifiedAddress = `${this.nodeId}/message-group/${newReplicaId}`;
    this.messageRouter.register(unifiedAddress, (envelope) => {
      this.logger.debug('[JOIN-DEBUG] Message received at joining node', {
        address: unifiedAddress,
        envelopeType: envelope?.type || envelope?.payload?.type,
        from: envelope?.from || envelope?.payload?.address,
      });
      return messageGroup.receiveMessage(envelope);
    });

    this.logger.info('[JOIN-DEBUG] Registered message handler', {
      unifiedAddress,
      nodeId: this.nodeId,
    });

    await messageGroup.initialize();

    this.logger.info('[JOIN-DEBUG] MessageGroupService initialized', {
      nodeId: this.nodeId,
      groupId,
      newReplicaId,
      role: messageGroup.role,
      isLeader: messageGroup.isLeader,
      leaderId: messageGroup.leaderId,
      raftState: messageGroup.raft?.state,
      raftTerm: messageGroup.raft?.term,
    });

    this.messageGroupServices.set(newReplicaId, messageGroup);

    this.logger.info('[JOIN-DEBUG] Joined existing message group', {
      nodeId: this.nodeId,
      groupId,
      newReplicaId,
      hasMessageRouter: !!this.messageRouter,
      peerAddressCount: peerAddresses?.length || 0,
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

    this.logger.debug('Waiting for message group leadership', {
      nodeId: this.nodeId,
      timeoutMs,
      messageGroupCount: this.messageGroupServices.size,
    });

    while (Date.now() - startTime < timeoutMs) {
      // Check if any local replica is leader or has a known leader
      for (const [replicaId, service] of this.messageGroupServices) {
        if (service.isLeaderReplica() || service.getLeaderId()) {
          this.logger.debug('Message group leadership established', {
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
    throw new Error(
      `Message group failed to establish leadership within ${timeoutMs}ms`,
    );
  }

  /**
   * Phase 2: Connect to seed node via WebSocket for cross-node communication.
   * Requirements: 8.1, 8.2, 8.3, 8.4 - Bootstrap sequence: server → self-connect → services.
   * @return {Promise<void>}
   * @private
   */
  async phaseConnectWebSocket() {
    // Determine WebSocket port from config or options
    const wsPort = this.wsPort || this.config.wsPort;

    // Create MessageRouter for unified local/remote message routing
    // Requirements: 8.1, 8.2 - Initialize MessageRouter before creating services
    this.messageRouter = new MessageRouter({
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      wsPort: wsPort,
    });

    // Set up resolver to extract nodeId from address pattern "${nodeId}/..."
    this.messageRouter.setServiceNodeResolver((address) => {
      const match = address.match(/^([^/]+)\//);
      return match ? match[1] : null;
    });

    // Requirements: 8.1, 8.2, 8.4 - Start server first, then establish self-connection
    // If wsPort is specified, start server and establish self-connection
    // This ensures all messages (local and remote) go through WebSocket
    if (wsPort) {
      try {
        // Requirements: 8.1 - Start WebSocket server first
        await this.messageRouter.initialize({startServer: true});

        this.logger.info('WebSocket server started and self-connection established', {
          nodeId: this.nodeId,
          wsPort: wsPort,
          hasSelfConnection: this.messageRouter.hasSelfConnection(),
        });
      } catch (error) {
        // Requirements: 8.4 - Fail joining if self-connection fails
        this.logger.error('MessageRouter initialization failed', {
          nodeId: this.nodeId,
          wsPort: wsPort,
          error: error.message,
          stack: error.stack,
        });
        throw new Error(`MessageRouter initialization failed: ${error.message}`);
      }
    } else {
      // No wsPort - initialize without server (for testing or single-node scenarios)
      try {
        await this.messageRouter.initialize({startServer: false});
      } catch (error) {
        this.logger.error('MessageRouter initialization failed', {
          nodeId: this.nodeId,
          error: error.message,
          stack: error.stack,
        });
        throw new Error(`MessageRouter initialization failed: ${error.message}`);
      }
    }

    // Use MessageRouter directly for all services
    // MessageRouter handles both local and remote message delivery
    this.transport = this.messageRouter;

    // Get seed node WebSocket address from bootstrap response or options
    const seedWsAddress = this.seedNodeWsAddress ||
      this.bootstrapResponse?.seedNodeWsAddress;

    // Get seed node ID from bootstrap response
    const seedNodeId = this.bootstrapResponse?.seedNodeId;

    // Connect to seed node if address is available
    if (seedWsAddress && seedNodeId) {
      this.logger.info('[JOIN-DEBUG] Connecting to seed node via WebSocket', {
        nodeId: this.nodeId,
        seedWsAddress,
        seedNodeId,
      });

      try {
        await this.messageRouter.connectToNode(seedNodeId, seedWsAddress);

        this.logger.info('[JOIN-DEBUG] Connected to seed node via WebSocket', {
          nodeId: this.nodeId,
          seedNodeId,
          seedWsAddress,
          connectedNodes: this.messageRouter.getConnectedNodes?.() ||
            Array.from(this.messageRouter.nodeConnections?.keys() || []),
        });
      } catch (error) {
        this.logger.error('[JOIN-DEBUG] Failed to connect to seed node via WebSocket', {
          nodeId: this.nodeId,
          seedWsAddress,
          seedNodeId,
          error: error.message,
          stack: error.stack,
        });
        // Don't fail joining - WebSocket connection to seed is optional
      }
    } else {
      this.logger.warn('[JOIN-DEBUG] No seed node WebSocket address provided', {
        nodeId: this.nodeId,
        seedWsAddress,
        seedNodeId,
        bootstrapResponse: this.bootstrapResponse ? {
          seedNodeId: this.bootstrapResponse.seedNodeId,
          seedNodeWsAddress: this.bootstrapResponse.seedNodeWsAddress,
        } : null,
      });
    }

    this.logger.debug('WebSocket infrastructure setup complete', {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      wsPort: wsPort,
      hasMessageRouter: !!this.messageRouter,
      hasSelfConnection: wsPort ? this.messageRouter.hasSelfConnection() : false,
    });
  }

  /**
   * Phase 5: Query system partitions for cluster state and register this node.
   * @return {Promise<void>}
   * @private
   */
  async phaseQuerySystemState() {
    this.logger.debug('Querying system state', {
      nodeId: this.nodeId,
    });

    // Get partition leaders from bootstrap response
    const partitionLeaders = this.bootstrapResponse?.partitionLeaders || {};

    // For now, we just log that we would query the system state
    // In a full implementation, this would query each system table partition
    const systemTables = ['nodes', 'partitions', 'tables', 'services', 'message_groups'];

    for (const tableName of systemTables) {
      const leader = partitionLeaders[tableName];
      if (leader) {
        this.logger.debug('Would query system table', {
          tableName,
          partitionId: leader.partitionId,
          leaderAddress: leader.address,
        });
      }
    }

    // Initialize node service
    const nodeService = NodeService.getInstance();
    if (!nodeService.isInitialized()) {
      nodeService.initialize({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
      });
    }

    // Register this node in the nodes system table via seed node
    await this.registerNodeInCluster();

    this.logger.info('System state query complete', {
      nodeId: this.nodeId,
      tablesQueried: systemTables.length,
    });
  }

  /**
   * Register this node in the cluster's nodes system table.
   * @return {Promise<void>}
   * @private
   */
  async registerNodeInCluster() {
    const nodeService = NodeService.getInstance();
    const stats = await nodeService.getNodeStats();
    const now = Date.now();

    // Build node registration data
    const nodeData = {
      node_id: this.nodeId,
      node_address: this.nodeAddress,
      cpu_cores: stats.cpu.count,
      memory_mb: Math.round(stats.memory.totalBytes / (1024 * 1024)),
      disk_gb: 0,
      cpu_usage_percent: stats.cpu.usagePercent,
      memory_usage_percent: stats.memory.usagePercent,
      disk_usage_percent: 0,
      status: 'active',
      last_heartbeat: now,
      created_at: now,
    };

    // Send registration request to seed node
    const registerUrl = `${this.seedNodeAddress}/register-node`;

    this.logger.debug('Registering node in cluster', {
      nodeId: this.nodeId,
      registerUrl,
    });

    try {
      const response = await this.httpPost(registerUrl, nodeData);

      if (!response.success) {
        this.logger.warn('Node registration returned non-success', {
          nodeId: this.nodeId,
          error: response.error,
        });
      } else {
        this.logger.info('Node registered in cluster', {
          nodeId: this.nodeId,
        });
      }
    } catch (error) {
      // Log but don't fail - node can still operate without being in nodes table
      this.logger.warn('Failed to register node in cluster', {
        nodeId: this.nodeId,
        error: error.message,
      });
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
    // eslint-disable-next-line no-undef
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.httpTimeoutMs,
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.httpTimeoutMs}ms`);
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

    this.logger.error('Node joining failed', {
      nodeId: this.nodeId,
      phase: this.phase,
      duration,
      error: error.message,
      stack: error.stack,
    });

    // Clean up partially initialized services
    await this.cleanup();

    this.emit('failed', {
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
    this.logger.info('Cleaning up partially initialized services', {
      nodeId: this.nodeId,
      messageGroupServices: this.messageGroupServices.size,
      partitionServices: this.partitionServices.size,
    });

    // Shutdown replica state machine
    if (this.replicaStateMachine) {
      this.replicaStateMachine.stopTimeoutChecker();
      this.replicaStateMachine.clear();
      this.replicaStateMachine = null;
    }

    // Shutdown replica lifecycle manager
    if (this.replicaLifecycleManager) {
      this.replicaLifecycleManager.shutdown();
      this.replicaLifecycleManager = null;
    }

    // Shutdown partition services
    for (const [replicaId, partition] of this.partitionServices) {
      try {
        if (partition.shutdown) {
          await partition.shutdown();
        }
        this.logger.debug('Partition service cleaned up', {replicaId});
      } catch (err) {
        this.logger.warn('Error cleaning up partition service', {
          replicaId,
          error: err.message,
        });
      }
    }
    this.partitionServices.clear();

    // Shutdown message group services
    for (const [replicaId, messageGroup] of this.messageGroupServices) {
      try {
        if (messageGroup.shutdown) {
          await messageGroup.shutdown();
        }
        this.logger.debug('Message group service cleaned up', {replicaId});
      } catch (err) {
        this.logger.warn('Error cleaning up message group service', {
          replicaId,
          error: err.message,
        });
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

    this.logger.info('Cleanup complete', {nodeId: this.nodeId});
  }

  /**
   * Initialize the ReplicaLifecycleManager to handle CREATE_REPLICA/REMOVE_REPLICA.
   * Requirements: 3.1, 3.2 - Use MessageRouter directly for all communication.
   * @private
   */
  initializeReplicaLifecycleManager() {
    // Get the first available message group service for routing
    let messageGroupService = null;
    for (const service of this.messageGroupServices.values()) {
      if (service.isLeaderReplica() || service.getLeaderId()) {
        messageGroupService = service;
        break;
      }
    }

    // Requirements: 3.1, 3.2 - Use MessageRouter directly for all communication
    // MessageRouter handles both local and remote message delivery
    if (!this.messageRouter) {
      this.logger.error('MessageRouter not available for ReplicaLifecycleManager', {
        nodeId: this.nodeId,
      });
      throw new Error('MessageRouter must be initialized before ' +
        'ReplicaLifecycleManager');
    }

    // Create ReplicaStateMachine for tracking replica lifecycle states
    this.replicaStateMachine = new ReplicaStateMachine({
      nodeId: this.nodeId,
    });

    // Start the timeout checker for stuck operations
    this.replicaStateMachine.startTimeoutChecker();

    // Create partition service factory that includes messageGroupService and transport
    const createPartitionService = async (options) => {
      const partition = new PartitionService({
        ...options,
        transport: this.transport,
        messageGroupService: messageGroupService,
        messageRouter: this.messageRouter,
        replicaStateMachine: this.replicaStateMachine,
      });

      // Note: PartitionService now registers itself with unified address format
      // in its initialize() method. No need to register here.

      await partition.initialize();

      // Track the partition service
      this.partitionServices.set(options.replicaId, partition);

      return partition;
    };

    // Create ReplicaLifecycleManager with state machine
    this.replicaLifecycleManager = new ReplicaLifecycleManager({
      nodeId: this.nodeId,
      messageGroupService: messageGroupService,
      createPartitionService: createPartitionService,
      dataDir: this.dataDir,
      replicaStateMachine: this.replicaStateMachine,
    });

    this.replicaLifecycleManager.initialize();

    // Register lifecycle handler with MessageRouter - single registration point
    // MessageRouter handles both local delivery and WebSocket from remote nodes
    // Requirements: 1.1, 5.1 - Unified address format ${nodeId}/${entityType}/${entityId}
    const lifecycleAddress = `${this.nodeId}/lifecycle/manager`;
    const lifecycleHandler = async (envelope) => {
      const message = envelope.payload || envelope;
      if (message.type === 'CREATE_REPLICA') {
        const ack = await this.replicaLifecycleManager.handleCreateReplica(message);
        if (messageGroupService) {
          messageGroupService.emit('CREATE_REPLICA_ACK', ack);
        }
        // Return flat structure - spread ACK fields directly
        return {acknowledged: true, ...ack};
      } else if (message.type === 'REMOVE_REPLICA') {
        const ack = await this.replicaLifecycleManager.handleRemoveReplica(message);
        if (messageGroupService) {
          messageGroupService.emit('REMOVE_REPLICA_ACK', ack);
        }
        // Return flat structure - spread ACK fields directly
        return {acknowledged: true, ...ack};
      }
      return {acknowledged: false, error: 'Unknown message type'};
    };

    if (this.messageRouter) {
      this.messageRouter.register(lifecycleAddress, lifecycleHandler);
    }

    this.logger.info('ReplicaLifecycleManager initialized', {
      nodeId: this.nodeId,
      hasMessageGroupService: !!messageGroupService,
    });
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
      startTime: this.startTime,
      duration: this.startTime ? Date.now() - this.startTime : 0,
      messageGroupCount: this.messageGroupServices.size,
      lastError: this.lastError?.message || null,
    };
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

export {NodeJoiningService, JoiningPhase, DEFAULT_JOINING_CONFIG};
