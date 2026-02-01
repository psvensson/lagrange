/**
 * Bootstrap API - REST API for node bootstrap and discovery.
 * Implements /bootstrap endpoint for new node registration.
 *
 * Architecture:
 * - System cache is the single source of truth for all cluster state
 * - Bootstrap response contains complete snapshots of all system tables
 * - Joining nodes hydrate their cache from these snapshots
 * - After hydration, all nodes use system cache for query routing
 *
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import Fastify from 'fastify';
import {validate as uuidValidate} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {assertCritical} from '../utils/assert.js';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  ERRNO,
  HTTP_STATUS,
  HOST,
  NUM,
  PROTOCOL,
  SERVICE_TYPE,
  STATE,
  STRING,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {CACHE_SYSTEM_TABLES} from '../cache/cache-constants.js';
import {getMissingSystemServiceLeaders} from '../cache/leader-readiness-gate.js';
import {
  BOOTSTRAP_ASSIGNMENT_STRATEGY,
  BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT,
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from './bootstrap-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {NODE_CONFIG_KEY, NODE_DEFAULT} from '../node/node-constants.js';
import {CONFIG_CATEGORY} from '../config/config-constants.js';
import {
  BOOTSTRAP_API_CLUSTER_STATE,
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_CLOSE_ERROR_CODE,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_HEALTH_STATUS,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_MESSAGE_GROUP_PREFIX,
  BOOTSTRAP_API_ROUTE,
  BOOTSTRAP_API_SQL,
  BOOTSTRAP_API_SUBSYSTEM,
} from './bootstrap-api-constants.js';

/**
 * Bootstrap response strategies.
 */
const BootstrapStrategy = BOOTSTRAP_ASSIGNMENT_STRATEGY;

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
   * @param {string} [options.seedNodeWsAddress] - Seed node WebSocket address.
   * @param {number} options.wsPort - WebSocket port for cross-node communication.
   * @param {Map} options.messageGroupServices - Message group services map.
   * @param {Map} options.partitionServices - Partition services map.
   * @param {Object} options.replicaHandler - Replica handler.
   * @param {BootstrapService} options.bootstrapService - Bootstrap service for rebalancing.
   * @param {Object} [options.epochManager] - Assignment epoch manager.
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache || null;
    this.seedNodeId = options.seedNodeId || null;
    this.seedNodeAddress = options.seedNodeAddress || null;
    this.seedNodeWsAddress = options.seedNodeWsAddress || null;
    this.wsPort = options.wsPort || null;
    this.messageGroupServices = options.messageGroupServices || new Map();
    this.partitionServices = options.partitionServices || new Map();
    this.replicaHandler = options.replicaHandler || null;
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.bootstrapService = options.bootstrapService || null;
    this.epochManager = options.epochManager || null;
    this.messageRouter = options.messageRouter || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.port = config.get(NODE_CONFIG_KEY.REST_API_PORT) ||
      NODE_DEFAULT.REST_API_PORT;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_API_SUBSYSTEM) : console;

    // Fastify instance
    this.fastify = null;
    this.initialized = false;
  }

  /**
   * Set the SQL query engine for distributed queries.
   * Called after initialization when the engine becomes available.
   * @param {Object} sqlQueryEngine - SQL query engine instance.
   */
  setSqlQueryEngine(sqlQueryEngine) {
    this.sqlQueryEngine = sqlQueryEngine;
    this.logger.debug(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_SET);
  }

  /**
   * Initialize and start the API server.
   * @param {number} port - Port to listen on (optional, 0 for random port).
   * @param {Object} [options] - Initialization options.
   * @param {boolean} [options.listen] - Whether to listen on a TCP port.
   * @return {Promise<void>}
   */
  async initialize(port, options = {}) {
    if (this.initialized) {
      return;
    }

    // Use provided port (including 0 for random), or fall back to configured port
    const listenPort = port !== undefined ? port : this.port;
    const shouldListen = options.listen !== false;

    this.fastify = Fastify({
      logger: false, // We use our own logger
    });

    // Register routes
    this.registerRoutes();

    // Start server if required
    if (shouldListen) {
      try {
        await this.fastify.listen({port: listenPort, host: HOST.ANY});
      } catch (err) {
        // Some sandboxes disallow binding to 0.0.0.0; fall back to localhost.
        if (err && (err.code === ERRNO.EPERM || err.code === ERRNO.EACCES)) {
          await this.fastify.listen({port: listenPort, host: HOST.LOCALHOST});
        } else {
          throw err;
        }
      }
    } else {
      await this.fastify.ready();
    }
    this.initialized = true;

    this.logger.info(BOOTSTRAP_API_LOG_MSG.STARTED, {
      port: shouldListen ? listenPort : null,
      listen: shouldListen,
      seedNodeId: this.seedNodeId,
    });
  }

  /**
   * Register API routes.
   * @private
   */
  registerRoutes() {
    // Health check endpoint
    this.fastify.get(BOOTSTRAP_API_ROUTE.HEALTH, async (_request, _reply) => {
      return {status: BOOTSTRAP_API_HEALTH_STATUS, nodeId: this.seedNodeId};
    });

    // Bootstrap endpoint for new node registration
    this.fastify.post(BOOTSTRAP_API_ROUTE.BOOTSTRAP, async (request, reply) => {
      return this.handleBootstrapRequest(request, reply);
    });

    // Register service endpoint - inserts service into services system table
    this.fastify.post(BOOTSTRAP_API_ROUTE.REGISTER_SERVICE, async (request, reply) => {
      return this.handleRegisterServiceRequest(request, reply);
    });

    // Get cluster state endpoint
    this.fastify.get(BOOTSTRAP_API_ROUTE.CLUSTER_STATE, async (_request, _reply) => {
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

    this.logger.info(BOOTSTRAP_API_LOG_MSG.RECEIVED_BOOTSTRAP_REQUEST, {
      nodeId,
      nodeAddress,
      seedNodeId: this.seedNodeId,
    });

    // Validate request
    const validationError = this.validateBootstrapRequest(nodeId, nodeAddress);
    if (validationError) {
      this.logger.warn(BOOTSTRAP_API_LOG_MSG.VALIDATION_FAILED, {
        nodeId,
        nodeAddress,
        error: validationError,
      });
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {error: validationError};
    }

    // Check for conflicts
    const conflictError = this.checkForConflicts(nodeId, nodeAddress);
    if (conflictError) {
      this.logger.warn(BOOTSTRAP_API_LOG_MSG.CONFLICT_DETECTED, {
        nodeId,
        nodeAddress,
        error: conflictError,
      });
      reply.code(HTTP_STATUS.CONFLICT);
      return {error: conflictError};
    }

    if (this.bootstrapService &&
        this.bootstrapService.phase !== BOOTSTRAP_PHASE.COMPLETE) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return {
        success: false,
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        phase: this.bootstrapService.phase,
      };
    }

    try {
      const leaderStatus = await this.waitForServiceLeaders();
      if (!leaderStatus.ready) {
        this.logger.warn(BOOTSTRAP_API_LOG_MSG.LEADERS_NOT_READY, {
          nodeId,
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders,
          missingMessageGroupLeaders: leaderStatus.missingMessageGroupLeaders,
          missingPartitionLeaderNodes: leaderStatus.missingPartitionLeaderNodes,
          missingMessageGroupLeaderNodes: leaderStatus.missingMessageGroupLeaderNodes,
        });
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return {
          success: false,
          error: BOOTSTRAP_API_ERROR.RAFT_LEADERS_NOT_READY,
          code: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders,
          missingMessageGroupLeaders: leaderStatus.missingMessageGroupLeaders,
          missingPartitionLeaderNodes: leaderStatus.missingPartitionLeaderNodes,
          missingMessageGroupLeaderNodes: leaderStatus.missingMessageGroupLeaderNodes,
        };
      }

      // Determine message group assignment strategy
      const assignment = this.determineMessageGroupAssignment(nodeId);

      // Build complete system table snapshots for the new node
      const systemTableSnapshots = this.buildSystemTableSnapshots();

      // Get cluster configuration
      const clusterConfig = this.getClusterConfiguration();

      // Get ready nodes for pull-based assignment
      const readyNodes = this.getReadyNodes();

      this.logger.info(BOOTSTRAP_API_LOG_MSG.READY_NODES_FOR_BOOTSTRAP, {
        nodeId,
        readyNodesCount: readyNodes.length,
        readyNodes,
        seedNodeId: this.seedNodeId,
      });

      // Get table policies for assignment validation
      const tablePolicies = this.getTablePolicies();

      // Get current assignment epoch if available
      const currentEpoch = this.getCurrentEpoch();

      // Node registration happens after WebSocket IDENTIFY + NODE_STATE_UPDATE.
      // System table cache is the source of truth.

      // Build seed node WebSocket address for cross-node communication
      let seedNodeWsAddress = this.seedNodeWsAddress || null;
      if (!seedNodeWsAddress && this.seedNodeAddress &&
          /^wss?:\/\//.test(this.seedNodeAddress)) {
        seedNodeWsAddress = this.seedNodeAddress;
      }
      if (!seedNodeWsAddress && this.wsPort) {
        // Extract host from seedNodeAddress (e.g., 'localhost:8080' -> 'localhost')
        const host = this.seedNodeAddress ?
          this.seedNodeAddress
            .replace(/^https?:\/\//, STRING.EMPTY)
            .replace(/^wss?:\/\//, STRING.EMPTY)
            .split(ADDRESS.PORT_SEPARATOR)[NUM.ZERO] :
          BOOTSTRAP_API_DEFAULT.WS_HOST;
        seedNodeWsAddress = `${PROTOCOL.WS}${host}` +
          `${ADDRESS.PORT_SEPARATOR}${this.wsPort}`;
      }

      const response = {
        success: true,
        seedNodeId: this.seedNodeId,
        seedNodeAddress: this.seedNodeAddress,
        seedNodeWsAddress,
        messageGroupAssignment: assignment,
        systemTableSnapshots,
        readyNodes,
        tablePolicies,
        currentEpoch,
        clusterConfig,
        timestamp: Date.now(),
      };

      this.logger.info(BOOTSTRAP_API_LOG_MSG.RESPONSE_PREPARED, {
        nodeId,
        strategy: assignment.strategy,
        groupId: assignment.groupId,
      });

      return response;
    } catch (error) {
      this.logger.error(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_FAILED, {
        nodeId,
        nodeAddress,
        error: error.message,
        stack: error.stack,
      });
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      throw error;
    }
  }

  /**
   * Handle register node request - inserts node into nodes system table.
   * Uses SQL query engine to route to the correct partition leader.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Registration response.
   */
  async handleRegisterNodeRequest(request, reply) {
    this.logger.warn(BOOTSTRAP_API_LOG_MSG.REGISTER_NODE_UNSUPPORTED, {
      seedNodeId: this.seedNodeId,
    });
    reply.code(HTTP_STATUS.GONE);
    throw new Error(BOOTSTRAP_API_ERROR.REGISTER_NODE_UNSUPPORTED);
  }

  /**
   * Handle register-service request from a joining node.
   * Inserts the service into the services system table.
   * @param {Object} request - Fastify request.
   * @param {Object} reply - Fastify reply.
   * @return {Promise<Object>} Registration response.
   */
  async handleRegisterServiceRequest(request, reply) {
    const serviceData = request.body || {};

    this.logger.info(BOOTSTRAP_API_LOG_MSG.RECEIVED_REGISTER_SERVICE, {
      serviceId: serviceData[COLUMN.SERVICE_ID],
      serviceType: serviceData[COLUMN.SERVICE_TYPE],
      nodeId: serviceData[COLUMN.NODE_ID],
      groupId: serviceData[COLUMN.GROUP_ID],
    });

    // Validate required fields
    if (!serviceData[COLUMN.SERVICE_ID]) {
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {success: false, error: BOOTSTRAP_API_ERROR.SERVICE_ID_REQUIRED};
    }

    if (!serviceData[COLUMN.SERVICE_TYPE]) {
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {success: false, error: BOOTSTRAP_API_ERROR.SERVICE_TYPE_REQUIRED};
    }

    if (!serviceData[COLUMN.NODE_ID]) {
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {success: false, error: BOOTSTRAP_API_ERROR.SERVICE_NODE_ID_REQUIRED};
    }

    try {
      // Use SQL query engine to insert/update the service
      if (!this.sqlQueryEngine) {
        this.logger.error(BOOTSTRAP_API_LOG_MSG.SQL_ENGINE_MISSING);
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return {success: false, error: BOOTSTRAP_API_ERROR.SQL_ENGINE_UNAVAILABLE};
      }

      // Use INSERT OR REPLACE to handle both new and existing services
      const sql = BOOTSTRAP_API_SQL.UPSERT_SERVICE;

      const params = [
        serviceData[COLUMN.SERVICE_ID],
        serviceData[COLUMN.SERVICE_TYPE],
        serviceData[COLUMN.NODE_ID],
        serviceData[COLUMN.PARTITION_ID] || null,
        serviceData[COLUMN.GROUP_ID] || null,
        serviceData[COLUMN.REPLICA_ID] || serviceData[COLUMN.SERVICE_ID],
        serviceData[COLUMN.RAFT_ROLE] || RAFT_ROLE.FOLLOWER,
        serviceData[COLUMN.STATUS] || STATE.ACTIVE,
        serviceData[COLUMN.ADDRESS] || null,
        serviceData[COLUMN.CREATED_AT] || Date.now(),
        serviceData[COLUMN.UPDATED_AT] || Date.now(),
      ];

      const result = await this.sqlQueryEngine.executeQuery(sql, params);

      if (!result.success) {
        throw new Error(result.error || BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED);
      }

      this.logger.info(BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTERED, {
        serviceId: serviceData[COLUMN.SERVICE_ID],
        serviceType: serviceData[COLUMN.SERVICE_TYPE],
        nodeId: serviceData[COLUMN.NODE_ID],
        groupId: serviceData[COLUMN.GROUP_ID],
      });

      return {success: true, serviceId: serviceData[COLUMN.SERVICE_ID]};
    } catch (error) {
      this.logger.error(BOOTSTRAP_API_LOG_MSG.REGISTER_SERVICE_FAILED, {
        serviceId: serviceData[COLUMN.SERVICE_ID],
        error: error.message,
        stack: error.stack,
      });
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      throw error;
    }
  }

  /**
   * Get the leader partition info for a specific table.
   * Uses ONLY the system cache - no fallbacks.
   * @param {string} tableName - Table name.
   * @return {Object|null} Leader partition info or null.
   * @private
   */
  getLeaderPartitionForTable(tableName) {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    // Get partition from system cache - the single source of truth
    const partitions = systemTableCache.filter(TABLES.PARTITIONS, (p) =>
      p.table_id === tableName || p.table_name === tableName,
    ) || [];

    if (partitions.length === NUM.ZERO) {
      return null;
    }

    const partition = partitions[NUM.ZERO];

    // Find the leader service
    const services = systemTableCache.filter(TABLES.SERVICES, (service) =>
      service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID] &&
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      service[COLUMN.STATUS] === STATE.ACTIVE,
    ) || [];

    if (services.length === NUM.ZERO) {
      return null;
    }

    return {
      partitionId: partition[COLUMN.PARTITION_ID],
      tableName: tableName,
      leaderNodeId: services[NUM.ZERO][COLUMN.NODE_ID],
      replicaId: services[NUM.ZERO][COLUMN.REPLICA_ID] ||
        services[NUM.ZERO][COLUMN.SERVICE_ID],
      address: services[NUM.ZERO][COLUMN.ADDRESS],
    };
  }

  /**
   * Validate bootstrap request parameters.
   * @param {string} nodeId - Node ID from request.
   * @param {string} nodeAddress - Node address from request.
   * @return {string|null} Error message or null if valid.
   */
  validateBootstrapRequest(nodeId, nodeAddress) {
    if (!nodeId) {
      return BOOTSTRAP_API_ERROR.NODE_ID_REQUIRED;
    }

    if (!uuidValidate(nodeId)) {
      return BOOTSTRAP_API_ERROR.NODE_ID_INVALID;
    }

    if (!nodeAddress) {
      return BOOTSTRAP_API_ERROR.NODE_ADDRESS_REQUIRED;
    }

    if (typeof nodeAddress !== TYPEOF.STRING || nodeAddress.length === NUM.ZERO) {
      return BOOTSTRAP_API_ERROR.NODE_ADDRESS_INVALID;
    }

    return null;
  }

  /**
   * Check for node ID or address conflicts using system table cache.
   * @param {string} nodeId - Node ID to check.
   * @param {string} nodeAddress - Node address to check.
   * @return {string|null} Error message or null if no conflict.
   */
  checkForConflicts(nodeId, nodeAddress) {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    // Check if this is the seed node
    if (nodeId === this.seedNodeId) {
      return BOOTSTRAP_API_ERROR.SEED_NODE_ID_CONFLICT;
    }

    // Check against seed node address
    if (nodeAddress === this.seedNodeAddress) {
      return BOOTSTRAP_API_ERROR.SEED_NODE_ADDRESS_CONFLICT;
    }

    // Check system table cache for existing nodes
    // Check if node ID already exists
    const existingNode = systemTableCache.get(TABLES.NODES, nodeId);
    if (existingNode) {
      return `Node ID ${nodeId} is already registered`;
    }

    // Check for address conflicts
    const allNodes = systemTableCache.getAll(TABLES.NODES) || [];
    for (const node of allNodes) {
      if (node.node_address === nodeAddress) {
        return `Node address ${nodeAddress} is already in use`;
      }
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

    this.logger.info(BOOTSTRAP_API_LOG_MSG.JOIN_ASSIGNMENT, {
      newNodeId,
      messageGroupCount: messageGroups.length,
      messageGroups: messageGroups.map((g) => ({
        groupId: g.group_id,
        replicaCount: g.replicas?.length || NUM.ZERO,
        replicas: g.replicas?.map((r) => ({
          replicaId: r.replica_id,
          nodeId: r.node_id,
          address: r.address,
        })),
      })),
    });

    // Strategy 1: Find a message group with 2+ replicas on the same node
    const movableReplica = this.findMessageGroupWithMovableReplica(messageGroups);

    if (movableReplica) {
      this.logger.info(BOOTSTRAP_API_LOG_MSG.JOIN_MOVABLE_REPLICA, {
        newNodeId,
        groupId: movableReplica.groupId,
        sourceNodeId: movableReplica.sourceNodeId,
        replicaToMove: movableReplica.replicaId,
        peerIds: movableReplica.peerIds,
        peerAddresses: movableReplica.peerAddresses,
        replicaAddresses: movableReplica.replicaAddresses,
      });

      return {
        strategy: BootstrapStrategy.MOVE_REPLICA,
        groupId: movableReplica.groupId,
        sourceNodeId: movableReplica.sourceNodeId,
        replicaToMove: movableReplica.replicaId,
        replicaAddresses: movableReplica.replicaAddresses,
        existingPeerIds: movableReplica.peerIds,
        peerAddresses: movableReplica.peerAddresses,
      };
    }

    // Strategy 2: Create self-hosted message group
    const newGroupId = `${BOOTSTRAP_API_MESSAGE_GROUP_PREFIX}` +
      `${newNodeId.substring(NUM.ZERO, BOOTSTRAP_API_DEFAULT.MG_ID_LENGTH)}`;

    const assignment = {
      strategy: BootstrapStrategy.CREATE_SELF_HOSTED,
      groupId: newGroupId,
      replicaCount: NUM.THREE,
    };

    // If message groups exist but no movable replicas are available,
    // include peer addresses so the joining node can reach the control plane.
    const fallbackGroup = messageGroups.find((group) =>
      Array.isArray(group.replicas) && group.replicas.length > NUM.ZERO,
    ) || messageGroups[NUM.ZERO];

    if (fallbackGroup && Array.isArray(fallbackGroup.replicas)) {
      const replicas = fallbackGroup.replicas;
      assignment.existingPeerIds = replicas.map((r) => r.replica_id);
      assignment.replicaAddresses = replicas.map((r) => r.address);
      assignment.peerAddresses = replicas.map((r) =>
        `${r.node_id}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}` +
        `${ADDRESS.SEPARATOR}${r.replica_id}`,
      );
      assignment.replicaNodeMap = Object.fromEntries(
        replicas.map((r) => [r.replica_id, r.node_id]),
      );
    }

    return assignment;
  }

  /**
   * Wait for partition leaders when live services are available.
   * @return {Promise<void>}
   * @private
   */
  async waitForPartitionLeaders() {
    if (typeof this.bootstrapService?.waitForPartitionLeadership === TYPEOF.FUNCTION) {
      await this.bootstrapService.waitForPartitionLeadership();
      return;
    }

    const services = this.partitionServices;
    if (!services || services.size === NUM.ZERO) {
      return;
    }

    const partitionIds = new Set();
    for (const service of services.values()) {
      if (service?.partitionId) {
        partitionIds.add(service.partitionId);
      }
    }
    if (partitionIds.size === NUM.ZERO) {
      return;
    }

    const timeoutMs = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS;
    let delay = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS;
    const maxDelay = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.MAX_DELAY_MS;
    const backoff = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.BACKOFF_MULTIPLIER;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const leaders = this.getSystemPartitionLeaders();
      if (Object.keys(leaders).length > NUM.ZERO) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoff, maxDelay);
    }
  }

  /**
   * Get all message groups from system cache.
   * Uses the system cache (fed by CDC) as the single source of truth.
   * @return {Array<Object>} Message groups.
   */
  getMessageGroups() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    // Get message group services from services table in system cache
    // The system cache is the single source of truth (fed by CDC)
    const services = systemTableCache.getAll(TABLES.SERVICES) || [];
    const messageGroupServices = services.filter((service) =>
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP,
    );

    // Group services by group_id to build message groups
    const groupsFromServices = new Map();
    for (const service of messageGroupServices) {
      const groupId = service[COLUMN.GROUP_ID];
      if (!groupId) {
        continue;
      }

      if (!groupsFromServices.has(groupId)) {
        groupsFromServices.set(groupId, {
          group_id: groupId,
          replicas: [],
          replica_count: NUM.ZERO,
        });
      }

      const group = groupsFromServices.get(groupId);
      group.replicas.push({
        replica_id: service[COLUMN.REPLICA_ID] || service[COLUMN.SERVICE_ID],
        node_id: service[COLUMN.NODE_ID],
        address: service[COLUMN.ADDRESS],
      });
      group.replica_count = group.replicas.length;
    }

    // If we found groups from services, return them
    if (groupsFromServices.size > NUM.ZERO) {
      return Array.from(groupsFromServices.values());
    }

    // Fall back to message_groups table (may be empty for MOVE_REPLICA tests)
    const cachedGroups = systemTableCache.getAll(TABLES.MESSAGE_GROUPS) || [];

    return cachedGroups.map((group) => {
      const replicas = messageGroupServices
        .filter((service) =>
          service[COLUMN.GROUP_ID] === group[COLUMN.GROUP_ID],
        )
        .map((service) => ({
          replica_id: service[COLUMN.REPLICA_ID] || service[COLUMN.SERVICE_ID],
          node_id: service[COLUMN.NODE_ID],
          address: service[COLUMN.ADDRESS],
        }));

      return {
        ...group,
        replicas,
      };
    });
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
        const count = replicasByNode.get(nodeId) || NUM.ZERO;
        replicasByNode.set(nodeId, count + NUM.ONE);
      }

      // Find node with 2+ replicas
      for (const [nodeId, count] of replicasByNode) {
        if (count >= NUM.TWO) {
          // Found a movable replica
          const replicaToMove = replicas.find((r) => r.node_id === nodeId);

          // Build unified peer addresses for Raft communication
          // Format: ${nodeId}/message-group/${replicaId}
          const peerAddresses = replicas.map((r) =>
            `${r.node_id}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}` +
            `${ADDRESS.SEPARATOR}${r.replica_id}`);

          return {
            groupId: group.group_id,
            sourceNodeId: nodeId,
            replicaId: replicaToMove.replica_id,
            replicaAddresses: replicas.map((r) => r.address),
            peerIds: replicas.map((r) => r.replica_id),
            // Include unified peer addresses for Raft communication
            peerAddresses: peerAddresses,
            // Include replica to node mapping for address resolution
            replicaNodeMap: Object.fromEntries(
              replicas.map((r) => [r.replica_id, r.node_id]),
            ),
          };
        }
      }
    }

    return null;
  }

  /**
   * Build complete system table snapshots for bootstrap response.
   * Reads all system tables from system cache and returns complete snapshots.
   *
   * System Cache Seeding Architecture:
   * - System cache is the single source of truth for cluster state
   * - Bootstrap response includes complete snapshots of all system tables:
   *   * nodes - All registered nodes with addresses and status
   *   * partitions - All partitions with key ranges and replica counts
   *   * services - All services (partition/message group replicas) with addresses and Raft roles
   *   * tables - All user tables with schemas and policies
   *   * message_groups - All message groups with replica counts
   *   * replica_operations - Any pending replica operations
   *   * indices, config, logs, live_queries, contexts, code - additional system metadata
   * - Joining nodes hydrate their cache from these snapshots
   * - After hydration, joining nodes can immediately read and write to system tables
   * - No bootstrap directories needed - system cache provides all routing information
   *
   * @return {Object} System table snapshots with arrays for each table.
   */
  buildSystemTableSnapshots() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    // Get snapshots from cache
    const snapshots = {};
    for (const tableName of CACHE_SYSTEM_TABLES) {
      snapshots[tableName] = systemTableCache.getAll(tableName) || [];
    }

    // Verify that we have partition leaders in the services table
    // Joining nodes need this information to write to system tables
    const serviceSnapshot = snapshots[TABLES.SERVICES] || [];
    const leaders = serviceSnapshot.filter((service) =>
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      service[COLUMN.STATUS] === STATE.ACTIVE,
    );

    if (leaders.length === NUM.ZERO) {
      this.logger.warn('No partition leaders found in system cache', {
        seedNodeId: this.seedNodeId,
        totalServices: serviceSnapshot.length,
      });
    }

    return snapshots;
  }

  /**
   * Get service groups that are missing a leader.
   * @return {Object} Missing leader info by service type.
   * @private
   */
  getMissingServiceLeaders() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    return getMissingSystemServiceLeaders(systemTableCache, {
      requireLeaderNodeId: true,
    });
  }

  /**
   * Wait for all service raft groups to have leaders with complete routing info.
   * This is critical for bootstrap - joining nodes need complete leader information
   * (raft_role, node_id, address) to route writes correctly.
   * @return {Promise<Object>} Leader readiness status.
   * @private
   */
  async waitForServiceLeaders() {
    const hasLiveServices = (this.partitionServices &&
        this.partitionServices.size > NUM.ZERO) ||
      (this.messageGroupServices && this.messageGroupServices.size > NUM.ZERO);
    if (!hasLiveServices) {
      const missing = this.getMissingServiceLeaders();
      const missingCount = this.countMissingLeaderInfo(missing);
      return {ready: missingCount === NUM.ZERO, ...missing};
    }

    const timeoutMs = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS;
    let delay = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS;
    const maxDelay = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.MAX_DELAY_MS;
    const backoff = BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.BACKOFF_MULTIPLIER;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const missing = this.getMissingServiceLeaders();
      const missingCount = this.countMissingLeaderInfo(missing);

      if (missingCount === NUM.ZERO) {
        this.logger.info(BOOTSTRAP_API_LOG_MSG.LEADERS_READY || 'All service leaders ready', {
          seedNodeId: this.seedNodeId,
          elapsedMs: Date.now() - start,
        });
        return {ready: true, ...missing};
      }

      this.logger.debug('Waiting for service leaders', {
        missingCount,
        missingPartitionLeaders: missing.missingPartitionLeaders,
        missingPartitionLeaderAddresses: missing.missingPartitionLeaderAddresses,
        missingPartitionLeaderNodes: missing.missingPartitionLeaderNodes,
        elapsedMs: Date.now() - start,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoff, maxDelay);
    }

    const missing = this.getMissingServiceLeaders();
    this.logger.warn('Timeout waiting for service leaders', {
      seedNodeId: this.seedNodeId,
      timeoutMs,
      ...missing,
    });
    return {ready: false, ...missing};
  }

  /**
   * Count total missing leader information from getMissingServiceLeaders result.
   * Includes leaders without addresses - these are useless for query routing.
   * @param {Object} missing - Result from getMissingServiceLeaders.
   * @return {number} Total count of missing leader info.
   * @private
   */
  countMissingLeaderInfo(missing) {
    return (missing.missingPartitionLeaders?.length || NUM.ZERO) +
      (missing.missingMessageGroupLeaders?.length || NUM.ZERO) +
      (missing.missingPartitionLeaderNodes?.length || NUM.ZERO) +
      (missing.missingMessageGroupLeaderNodes?.length || NUM.ZERO) +
      (missing.missingPartitionLeaderAddresses?.length || NUM.ZERO) +
      (missing.missingMessageGroupLeaderAddresses?.length || NUM.ZERO);
  }

  /**
   * Get system partition leaders for new node to query.
   * Prefer live partition services when available to avoid races with cache updates.
   * @return {Object} Partition leader addresses by table name.
   */
  getSystemPartitionLeaders() {
    const leaders = {};

    // Prefer live partition services when available.
    if (this.partitionServices && this.partitionServices.size > NUM.ZERO) {
      for (const service of this.partitionServices.values()) {
        const tableName = service.tableId || service.tableName;
        if (!tableName || leaders[tableName]) {
          continue;
        }

        const role = typeof service.getRole === TYPEOF.FUNCTION ?
          service.getRole() :
          service.role;
        const isLeader = service.isLeader === true ||
          role === RAFT_ROLE.LEADER ||
          (typeof service.isLeaderReplica === TYPEOF.FUNCTION && service.isLeaderReplica());

        if (!isLeader) {
          continue;
        }

        const nodeId = service.nodeId || this.seedNodeId;
        const replicaId = service.replicaId || service.service_id;
        const address = service.unifiedAddress ||
          `${nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` +
          `${ADDRESS.SEPARATOR}${replicaId}`;

        leaders[tableName] = {
          partitionId: service.partitionId,
          replicaId,
          nodeId,
          address,
        };
      }

      if (Object.keys(leaders).length > NUM.ZERO) {
        return leaders;
      }
    }

    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    // Get partitions from system cache - the single source of truth
    const partitions = systemTableCache.getAll(TABLES.PARTITIONS) || [];
    const services = systemTableCache.getAll(TABLES.SERVICES) || [];

    for (const partition of partitions) {
      const tableName = partition.table_id || partition.table_name;
      if (!tableName || leaders[tableName]) {
        continue;
      }

      // Find the leader service for this partition
      const leaderService = services.find((service) =>
        service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID] &&
        service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
        service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
        service[COLUMN.STATUS] === STATE.ACTIVE,
      );

      if (leaderService) {
        leaders[tableName] = {
          partitionId: partition[COLUMN.PARTITION_ID],
          replicaId: leaderService[COLUMN.REPLICA_ID] ||
            leaderService[COLUMN.SERVICE_ID],
          nodeId: leaderService[COLUMN.NODE_ID],
          address: leaderService[COLUMN.ADDRESS],
        };
      }
    }

    return leaders;
  }

  /**
   * Get the list of ready node IDs from the system cache.
   * Always includes the seed node since it's responding to the bootstrap request.
   * Uses ONLY the system cache - no fallbacks.
   * @return {string[]} Ready node IDs.
   */
  getReadyNodes() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const readyNodes = systemTableCache.getReadyNodes();

    // Always include seed node - it's responding to this request so it's available
    // The seed node's heartbeat may have failed to update its lease, but it's clearly
    // operational if it's processing this bootstrap request
    if (this.seedNodeId && !readyNodes.includes(this.seedNodeId)) {
      readyNodes.push(this.seedNodeId);
    }

    return readyNodes;
  }

  /**
   * Get table policies from the system tables.
   * Uses ONLY the system cache - no fallbacks.
   * @return {Object} Table policies keyed by table name.
   */
  getTablePolicies() {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const tables = systemTableCache.getAll(TABLES.TABLES) || [];
    const policies = {};

    for (const table of tables) {
      const tableName = table.table_id || table.table_name;
      if (!tableName) {
        continue;
      }

      let policy = table.table_policies;
      if (typeof policy === TYPEOF.STRING && policy.length > NUM.ZERO) {
        try {
          policy = JSON.parse(policy);
        } catch (error) {
          throw new Error(
            `Invalid table policy for ${tableName}: ${error.message}`,
          );
        }
      }

      policies[tableName] = policy || {};
    }

    return policies;
  }

  /**
   * Get the current assignment epoch from the seed node.
   * @return {Object|null} Current epoch data or null if unavailable.
   */
  getCurrentEpoch() {
    const epochManager = this.epochManager ||
      this.bootstrapService?.getEpochManager?.();
    if (!epochManager) {
      return null;
    }

    const epoch = epochManager.getCurrentEpoch();
    return typeof epoch?.toObject === TYPEOF.FUNCTION ? epoch.toObject() : epoch;
  }

  /**
   * Get cluster configuration for new node.
   * @return {Object} Cluster configuration.
   */
  getClusterConfiguration() {
    const config = ConfigurationManager.getInstance();

    return {
      raft: config.getCategory(CONFIG_CATEGORY.RAFT),
      messageGroup: config.getCategory(CONFIG_CATEGORY.MESSAGE_GROUP),
      partition: config.getCategory(CONFIG_CATEGORY.PARTITION),
      logging: config.getCategory(CONFIG_CATEGORY.LOGGING),
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
      status: STATE.ACTIVE,
      isSeed: true,
    });

    // Add nodes from system table cache (source of truth)
    const systemTableCache = assertCritical(
      this.systemTableCache,
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );
    const allNodes = systemTableCache.getAll(TABLES.NODES) || [];
    for (const node of allNodes) {
      // Skip seed node (already added)
      if (node.node_id === this.seedNodeId) {
        continue;
      }
      nodes.push({
        nodeId: node.node_id,
        nodeAddress: node.node_address,
        status: node.status || BOOTSTRAP_API_CLUSTER_STATE.UNKNOWN,
        isSeed: false,
      });
    }

    // Get message groups
    const groups = this.getMessageGroups();
    for (const group of groups) {
      messageGroups.push({
        groupId: group.group_id,
        replicaCount: group.replicas?.length || NUM.ZERO,
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
   * Update node status - unsupported, status updates should go through CDC.
   * @param {string} _nodeId - Node ID (unused).
   * @param {string} _status - New status (unused).
   */
  updateNodeStatus(_nodeId, _status) {
    this.logger.error(BOOTSTRAP_API_LOG_MSG.UPDATE_NODE_STATUS_UNSUPPORTED);
    throw new Error(BOOTSTRAP_API_ERROR.UPDATE_NODE_STATUS_UNSUPPORTED);
  }

  /**
   * Get the Fastify instance.
   * @return {Object} Fastify instance.
   */
  getFastify() {
    return this.fastify;
  }

  /**
   * Get the ReplicaHandler instance.
   * @return {Object|null} Replica handler or null.
   */
  getReplicaHandler() {
    return this.replicaHandler;
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
      const server = this.fastify.server;
      if (server && typeof server.closeAllConnections === TYPEOF.FUNCTION) {
        server.closeAllConnections();
      }
      await this.fastify.close();
      if (server && typeof server.close === TYPEOF.FUNCTION) {
        await new Promise((resolve) => {
          server.close((error) => {
            if (error && error.code !== BOOTSTRAP_API_CLOSE_ERROR_CODE) {
              this.logger.warn(BOOTSTRAP_API_LOG_MSG.SERVER_CLOSE_ERROR, {
                error: error.message,
              });
            }
            resolve();
          });
        });
      }
      if (server && typeof server.unref === TYPEOF.FUNCTION) {
        server.unref();
      }
      this.fastify = null;
    }

    this.initialized = false;

    this.logger.info(BOOTSTRAP_API_LOG_MSG.SHUTDOWN, {
      seedNodeId: this.seedNodeId,
    });
  }
}

export {BootstrapAPI, BootstrapStrategy};
