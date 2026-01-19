/**
 * Bootstrap API - REST API for node bootstrap and discovery.
 * Implements /bootstrap endpoint for new node registration.
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import Fastify from 'fastify';
import {validate as uuidValidate} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * Bootstrap response strategies.
 */
const BootstrapStrategy = {
  MOVE_REPLICA: 'MOVE_REPLICA',
  CREATE_SELF_HOSTED: 'CREATE_SELF_HOSTED',
};

/**
 * BootstrapAPI provides REST endpoints for node bootstrap and discovery.
 */
class BootstrapAPI {
  /**
   * Create a new BootstrapAPI.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - System table cache for lookups.
   * @param {string} options.seedNodeId - Seed node ID.
   * @param {string} options.seedNodeAddress - Seed node address.
   * @param {Map} options.messageGroupServices - Message group services map.
   * @param {Map} options.partitionServices - Partition services map.
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache || null;
    this.seedNodeId = options.seedNodeId || null;
    this.seedNodeAddress = options.seedNodeAddress || null;
    this.messageGroupServices = options.messageGroupServices || new Map();
    this.partitionServices = options.partitionServices || new Map();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.port = config.get('node.restApiPort') || 8080;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('bootstrap-api') : console;

    // Fastify instance
    this.fastify = null;
    this.initialized = false;

    // Track registered nodes to prevent duplicates
    this.registeredNodes = new Map();
  }

  /**
   * Initialize and start the API server.
   * @param {number} port - Port to listen on (optional, 0 for random port).
   * @return {Promise<void>}
   */
  async initialize(port) {
    if (this.initialized) {
      return;
    }

    // Use provided port (including 0 for random), or fall back to configured port
    const listenPort = port !== undefined ? port : this.port;

    this.fastify = Fastify({
      logger: false, // We use our own logger
    });

    // Register routes
    this.registerRoutes();

    // Start server
    await this.fastify.listen({port: listenPort, host: '0.0.0.0'});

    this.initialized = true;

    this.logger.info('Bootstrap API started', {
      port: listenPort,
      seedNodeId: this.seedNodeId,
    });
  }

  /**
   * Register API routes.
   * @private
   */
  registerRoutes() {
    // Health check endpoint
    this.fastify.get('/health', async (_request, _reply) => {
      return {status: 'healthy', nodeId: this.seedNodeId};
    });

    // Bootstrap endpoint for new node registration
    this.fastify.post('/bootstrap', async (request, reply) => {
      return this.handleBootstrapRequest(request, reply);
    });

    // Get cluster state endpoint
    this.fastify.get('/cluster/state', async (_request, _reply) => {
      return this.getClusterState();
    });
  }

  /**
   * Handle bootstrap request from a new node.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Bootstrap response.
   */
  async handleBootstrapRequest(request, reply) {
    const {nodeId, nodeAddress} = request.body || {};

    this.logger.info('Received bootstrap request', {
      nodeId,
      nodeAddress,
      seedNodeId: this.seedNodeId,
    });

    // Validate request
    const validationError = this.validateBootstrapRequest(nodeId, nodeAddress);
    if (validationError) {
      this.logger.warn('Bootstrap request validation failed', {
        nodeId,
        nodeAddress,
        error: validationError,
      });
      reply.code(400);
      return {error: validationError};
    }

    // Check for conflicts
    const conflictError = this.checkForConflicts(nodeId, nodeAddress);
    if (conflictError) {
      this.logger.warn('Bootstrap request conflict detected', {
        nodeId,
        nodeAddress,
        error: conflictError,
      });
      reply.code(409);
      return {error: conflictError};
    }

    try {
      // Determine message group assignment strategy
      const assignment = this.determineMessageGroupAssignment(nodeId);

      // Get system partition leaders for the new node to query
      const partitionLeaders = this.getSystemPartitionLeaders();

      // Get cluster configuration
      const clusterConfig = this.getClusterConfiguration();

      // Register the new node (will be persisted via CDC later)
      this.registeredNodes.set(nodeId, {
        nodeId,
        nodeAddress,
        registeredAt: Date.now(),
        status: 'bootstrapping',
      });

      const response = {
        success: true,
        seedNodeId: this.seedNodeId,
        seedNodeAddress: this.seedNodeAddress,
        messageGroupAssignment: assignment,
        partitionLeaders,
        clusterConfig,
        timestamp: Date.now(),
      };

      this.logger.info('Bootstrap response prepared', {
        nodeId,
        strategy: assignment.strategy,
        groupId: assignment.groupId,
      });

      return response;
    } catch (error) {
      this.logger.error('Bootstrap request failed', {
        nodeId,
        nodeAddress,
        error: error.message,
        stack: error.stack,
      });
      reply.code(500);
      return {error: 'Internal server error during bootstrap'};
    }
  }

  /**
   * Validate bootstrap request parameters.
   * @param {string} nodeId - Node ID from request.
   * @param {string} nodeAddress - Node address from request.
   * @return {string|null} Error message or null if valid.
   */
  validateBootstrapRequest(nodeId, nodeAddress) {
    if (!nodeId) {
      return 'nodeId is required';
    }

    if (!uuidValidate(nodeId)) {
      return 'nodeId must be a valid UUID';
    }

    if (!nodeAddress) {
      return 'nodeAddress is required';
    }

    if (typeof nodeAddress !== 'string' || nodeAddress.length === 0) {
      return 'nodeAddress must be a non-empty string';
    }

    return null;
  }

  /**
   * Check for node ID or address conflicts.
   * @param {string} nodeId - Node ID to check.
   * @param {string} nodeAddress - Node address to check.
   * @return {string|null} Error message or null if no conflict.
   */
  checkForConflicts(nodeId, nodeAddress) {
    // Check if node ID already registered
    if (this.registeredNodes.has(nodeId)) {
      return `Node ID ${nodeId} is already registered`;
    }

    // Check if this is the seed node
    if (nodeId === this.seedNodeId) {
      return 'Cannot bootstrap with seed node ID';
    }

    // Check for address conflicts
    for (const [, node] of this.registeredNodes) {
      if (node.nodeAddress === nodeAddress) {
        return `Node address ${nodeAddress} is already in use`;
      }
    }

    // Check against seed node address
    if (nodeAddress === this.seedNodeAddress) {
      return 'Cannot use seed node address';
    }

    return null;
  }

  /**
   * Determine message group assignment for a new node.
   * @param {string} newNodeId - New node ID.
   * @return {Object} Assignment instructions.
   */
  determineMessageGroupAssignment(newNodeId) {
    // Get existing message groups from cache or services
    const messageGroups = this.getMessageGroups();

    // Strategy 1: Find a message group with 2+ replicas on the same node
    const movableReplica = this.findMessageGroupWithMovableReplica(messageGroups);

    if (movableReplica) {
      return {
        strategy: BootstrapStrategy.MOVE_REPLICA,
        groupId: movableReplica.groupId,
        sourceNodeId: movableReplica.sourceNodeId,
        replicaToMove: movableReplica.replicaId,
        replicaAddresses: movableReplica.replicaAddresses,
        existingPeerIds: movableReplica.peerIds,
      };
    }

    // Strategy 2: Create self-hosted message group
    const newGroupId = `mg-${newNodeId.substring(0, 8)}`;

    return {
      strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
      groupId: newGroupId,
      replicaCount: 3,
    };
  }

  /**
   * Get all message groups from cache or services.
   * @return {Array<Object>} Message groups.
   */
  getMessageGroups() {
    const groups = [];

    // Try to get from system table cache first
    if (this.systemTableCache) {
      try {
        const cachedGroups = this.systemTableCache.getAll('message_groups');
        if (cachedGroups && cachedGroups.length > 0) {
          return cachedGroups;
        }
      } catch {
        // Cache not available, fall back to services
      }
    }

    // Build from message group services
    const groupMap = new Map();

    for (const [replicaId, service] of this.messageGroupServices) {
      const groupId = service.groupId;

      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          group_id: groupId,
          replicas: [],
        });
      }

      groupMap.get(groupId).replicas.push({
        replica_id: replicaId,
        node_id: service.nodeId,
        address: `${this.seedNodeAddress}/services/${replicaId}`,
      });
    }

    for (const group of groupMap.values()) {
      groups.push(group);
    }

    return groups;
  }

  /**
   * Find a message group with 2+ replicas on the same node.
   * @param {Array<Object>} messageGroups - Message groups to search.
   * @return {Object|null} Movable replica info or null.
   */
  findMessageGroupWithMovableReplica(messageGroups) {
    for (const group of messageGroups) {
      const replicas = group.replicas || [];
      const replicasByNode = new Map();

      // Count replicas per node
      for (const replica of replicas) {
        const nodeId = replica.node_id;
        const count = replicasByNode.get(nodeId) || 0;
        replicasByNode.set(nodeId, count + 1);
      }

      // Find node with 2+ replicas
      for (const [nodeId, count] of replicasByNode) {
        if (count >= 2) {
          // Found a movable replica
          const replicaToMove = replicas.find((r) => r.node_id === nodeId);

          return {
            groupId: group.group_id,
            sourceNodeId: nodeId,
            replicaId: replicaToMove.replica_id,
            replicaAddresses: replicas.map((r) => r.address),
            peerIds: replicas.map((r) => r.replica_id),
          };
        }
      }
    }

    return null;
  }

  /**
   * Get system partition leaders for new node to query.
   * @return {Object} Partition leader addresses by table name.
   */
  getSystemPartitionLeaders() {
    const leaders = {};

    for (const [replicaId, partition] of this.partitionServices) {
      if (partition.isLeader) {
        const tableName = partition.tableName;
        if (!leaders[tableName]) {
          leaders[tableName] = {
            partitionId: partition.partitionId,
            replicaId,
            nodeId: partition.nodeId,
            address: `${this.seedNodeAddress}/services/${replicaId}`,
          };
        }
      }
    }

    return leaders;
  }

  /**
   * Get cluster configuration for new node.
   * @return {Object} Cluster configuration.
   */
  getClusterConfiguration() {
    const config = ConfigurationManager.getInstance();

    return {
      raft: config.getCategory('raft'),
      messageGroup: config.getCategory('messageGroup'),
      partition: config.getCategory('partition'),
      logging: config.getCategory('logging'),
    };
  }

  /**
   * Get current cluster state.
   * @return {Object} Cluster state.
   */
  getClusterState() {
    const nodes = [];
    const messageGroups = [];

    // Add seed node
    nodes.push({
      nodeId: this.seedNodeId,
      nodeAddress: this.seedNodeAddress,
      status: 'active',
      isSeed: true,
    });

    // Add registered nodes
    for (const [, node] of this.registeredNodes) {
      nodes.push({
        nodeId: node.nodeId,
        nodeAddress: node.nodeAddress,
        status: node.status,
        isSeed: false,
      });
    }

    // Get message groups
    const groups = this.getMessageGroups();
    for (const group of groups) {
      messageGroups.push({
        groupId: group.group_id,
        replicaCount: group.replicas?.length || 0,
        replicas: group.replicas || [],
      });
    }

    return {
      seedNodeId: this.seedNodeId,
      nodeCount: nodes.length,
      nodes,
      messageGroupCount: messageGroups.length,
      messageGroups,
      timestamp: Date.now(),
    };
  }

  /**
   * Update node status after bootstrap completes.
   * @param {string} nodeId - Node ID.
   * @param {string} status - New status.
   */
  updateNodeStatus(nodeId, status) {
    const node = this.registeredNodes.get(nodeId);
    if (node) {
      node.status = status;
      node.updatedAt = Date.now();
    }
  }

  /**
   * Get the Fastify instance.
   * @return {Object} Fastify instance.
   */
  getFastify() {
    return this.fastify;
  }

  /**
   * Check if the API is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Shutdown the API server.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (this.fastify) {
      await this.fastify.close();
      this.fastify = null;
    }

    this.initialized = false;

    this.logger.info('Bootstrap API shutdown', {
      seedNodeId: this.seedNodeId,
    });
  }
}

export {BootstrapAPI, BootstrapStrategy};
