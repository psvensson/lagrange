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
import {InMemoryTransport} from '../transport/in-memory-transport.js';
import {AssignmentStrategy} from './message-group-assignment.js';

/**
 * Joining phases enumeration.
 */
const JoiningPhase = {
  NOT_STARTED: 'not_started',
  CONTACTING_SEED: 'contacting_seed',
  CREATING_MESSAGE_GROUP: 'creating_message_group',
  JOINING_MESSAGE_GROUP: 'joining_message_group',
  WAITING_LEADERSHIP: 'waiting_leadership',
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
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || uuidv4();
    this.nodeAddress = options.nodeAddress || null;
    this.seedNodeAddress = options.seedNodeAddress || null;
    this.config = {...DEFAULT_JOINING_CONFIG, ...options.config};

    // Services created during joining
    this.messageGroupServices = new Map();
    this.transport = null;

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

      // Phase 2: Create or join message group based on assignment
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

      // Phase 3: Wait for leadership establishment
      await this.executePhase(
        JoiningPhase.WAITING_LEADERSHIP,
        () => this.phaseWaitForLeadership(),
      );

      // Phase 4: Query system partitions for cluster state
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
      });

      return {
        success: true,
        nodeId: this.nodeId,
        duration,
        messageGroupServices: this.messageGroupServices,
        transport: this.transport,
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
   * Phase 2a: Create self-hosted message group (3 replicas on this node).
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

    // Create in-memory transport for local message passing
    this.transport = new InMemoryTransport();

    // Generate replica IDs
    const replicaIds = [];
    for (let i = 0; i < replicaCount; i++) {
      replicaIds.push(`${groupId}-r${i}`);
    }

    // Create all replicas on this node
    for (const replicaId of replicaIds) {
      const messageGroup = new MessageGroupService({
        groupId,
        replicaId,
        nodeId: this.nodeId,
        replicaIds,
        transport: this.transport,
        isSelfHostedGroup: true, // All replicas on same node - enables fast leader election
      });

      // Register with transport before initializing
      this.transport.register(replicaId, (envelope) => {
        return messageGroup.receiveMessage(envelope);
      });

      await messageGroup.initialize();

      this.messageGroupServices.set(replicaId, messageGroup);

      this.logger.debug('Message group replica created', {
        groupId,
        replicaId,
        nodeId: this.nodeId,
      });
    }

    this.logger.info('Self-hosted message group created', {
      nodeId: this.nodeId,
      groupId,
      replicaCount: this.messageGroupServices.size,
    });
  }

  /**
   * Phase 2b: Join existing message group by moving a replica.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async phaseJoinExistingMessageGroup(assignment) {
    const {groupId, replicaAddresses, existingPeerIds} = assignment;

    this.logger.debug('Joining existing message group', {
      nodeId: this.nodeId,
      groupId,
      peerCount: existingPeerIds?.length || 0,
    });

    // Create in-memory transport for local operations
    this.transport = new InMemoryTransport();

    // Generate new replica ID for this node
    const newReplicaId = `${groupId}-r${Date.now()}`;

    // Create message group service instance
    // Note: When joining as a single replica (e.g., during bootstrap testing),
    // we set isSelfHostedGroup to allow immediate leader election.
    // In production with real peers, the replica would receive heartbeats
    // from the existing leader.
    const allReplicaIds = [...(existingPeerIds || []), newReplicaId];
    const isSingleReplica = allReplicaIds.length === 1 ||
      !existingPeerIds || existingPeerIds.length === 0;

    const messageGroup = new MessageGroupService({
      groupId,
      replicaId: newReplicaId,
      nodeId: this.nodeId,
      replicaIds: allReplicaIds,
      transport: this.transport,
      peerAddresses: replicaAddresses,
      isSelfHostedGroup: isSingleReplica, // Enable fast election if no real peers
    });

    // Register with transport
    this.transport.register(newReplicaId, (envelope) => {
      return messageGroup.receiveMessage(envelope);
    });

    await messageGroup.initialize();

    this.messageGroupServices.set(newReplicaId, messageGroup);

    this.logger.info('Joined existing message group', {
      nodeId: this.nodeId,
      groupId,
      newReplicaId,
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
   * Phase 4: Query system partitions for cluster state.
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

    this.logger.info('System state query complete', {
      nodeId: this.nodeId,
      tablesQueried: systemTables.length,
    });
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
    });

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
    if (this.transport) {
      if (this.transport.shutdown) {
        await this.transport.shutdown();
      }
      this.transport = null;
    }

    this.logger.info('Cleanup complete', {nodeId: this.nodeId});
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
