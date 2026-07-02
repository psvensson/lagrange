/**
 * QueryRouter handles routing queries to partition leaders.
 * Responsibilities:
 * - Finding service candidates for partitions
 * - Retry logic with exponential backoff
 * - Leader redirect following
 * - Timeout management
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * @interface
 * @constructor
 * @param {Object} options - Configuration options
 * @param {Object} options.systemCache - System table cache (REQUIRED)
 * @param {Object} options.messageRouter - Message router (REQUIRED)
 * @param {number} [options.timeoutMs] - Query timeout in milliseconds
 * @param {number} [options.retryAttempts] - Number of retry attempts
 * @param {number} [options.retryDelayMs] - Base delay between retries
 */

import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {generateCorrelationId} from '../utils/correlation.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_RESPONSE_TYPE,
  QUERY_ROUTER_ERROR_MSG,
  QUERY_ROUTER_LOG_MSG,
  QUERY_SUBSYSTEM,
} from './query-constants.js';
import {
  resolveCanonicalPartitionLeaderObservation,
  resolveCanonicalLeaderIdentitySnapshot,
} from './canonical-leader-routing.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

const LOCAL_STR_UNKNOWN_ROUTING_ERROR = 'Unknown routing error';

/**
 * QueryRouter handles routing queries to partition leaders with retry logic,
 * leader redirect following, and timeout management.
 */
class QueryRouter {
  /**
   * Create a new QueryRouter instance.
   * @param {Object} options - Configuration options
   * @param {Object} options.systemCache - System table cache (REQUIRED)
   * @param {Object} options.messageRouter - Message router (REQUIRED)
   * @param {number} [options.timeoutMs] - Query timeout in milliseconds
   * @param {number} [options.retryAttempts] - Number of retry attempts
   * @param {number} [options.retryDelayMs] - Base delay between retries
   */
  constructor(options = {}) {
    // Validate required dependencies (Requirements 3.1)
    this.systemCache = assertCritical(
      options.systemCache,
      QUERY_ROUTER_ERROR_MSG.SYSTEM_CACHE_REQUIRED,
    );
    this.messageRouter = assertCritical(
      options.messageRouter,
      QUERY_ROUTER_ERROR_MSG.MESSAGE_ROUTER_REQUIRED,
    );
    this.bootstrapTopologySnapshotOwner =
      options.bootstrapTopologySnapshotOwner || null;

    // Configuration with defaults (Requirements 3.3, 3.5)
    const config = ConfigurationManager.getInstance();
    this.timeoutMs = options.timeoutMs ||
      config.get(QUERY_CONFIG_KEY.QUERY_TIMEOUT_MS) ||
      QUERY_DEFAULTS.QUERY_TIMEOUT_MS;
    this.retryAttempts = options.retryAttempts ||
      config.get(QUERY_CONFIG_KEY.LEADER_RETRY_ATTEMPTS) ||
      QUERY_DEFAULTS.LEADER_RETRY_ATTEMPTS;
    this.retryDelayMs = options.retryDelayMs ||
      config.get(QUERY_CONFIG_KEY.LEADER_RETRY_DELAY_MS) ||
      QUERY_DEFAULTS.LEADER_RETRY_DELAY_MS;

    // Initialize logger
    this.logger = this.initLogger();
  }

  /**
   * Set optional bootstrap topology owner used for canonical leader metadata.
   * @param {Object|null} owner
   */
  setBootstrapTopologySnapshotOwner(owner) {
    this.bootstrapTopologySnapshotOwner = owner || null;
  }

  /**
   * Initialize logger for the QueryRouter.
   * @return {Object} Logger instance
   * @private
   */
  initLogger() {
    const loggingService = LoggingService.getInstance();
    if (loggingService.isInitialized()) {
      return loggingService.forSubsystem(QUERY_SUBSYSTEM.QUERY_ROUTER);
    }
    return console;
  }

  /**
   * Route a message to a partition with retry logic and timeout management.
   * Requirements: 3.1, 3.3, 3.4, 3.5
   *
   * @param {string} partitionId - Target partition ID
   * @param {Object} message - Message to route
   * @param {Object} [options] - Routing options
   * @param {string} [options.correlationId] - Correlation ID for tracing
   * @param {boolean} [options.preferLeader] - Whether to prefer leader replicas
   * @return {Promise<Object>} Routing result with success status and response
   */
  async routeToPartition(partitionId, message, options = {}) {
    const correlationId = options.correlationId || generateCorrelationId();
    const preferLeader = options.preferLeader !== false;
    const preferSameLatencyGroup = options.preferSameLatencyGroup === true;
    const localNodeId = options.localNodeId || null;
    const startTime = Date.now();

    this.logger.debug(QUERY_ROUTER_LOG_MSG.ROUTING_TO_PARTITION, {
      partitionId,
      correlationId,
      preferLeader,
      preferSameLatencyGroup,
      localNodeId,
    });

    // Get initial candidates (Requirements 3.2)
    let candidates = this.findServiceCandidates(partitionId, preferLeader, {
      preferSameLatencyGroup,
      localNodeId,
    });

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      // Check timeout (Requirements 3.5)
      const elapsed = Date.now() - startTime;
      if (elapsed >= this.timeoutMs) {
        this.logger.warn(QUERY_ROUTER_LOG_MSG.TIMEOUT_EXCEEDED, {
          partitionId,
          correlationId,
          elapsed,
          timeoutMs: this.timeoutMs,
        });
        throw new Error(
          QUERY_ROUTER_ERROR_MSG.routingTimeout(partitionId, this.timeoutMs),
        );
      }

      // Check if we have candidates
      if (candidates.length === 0) {
        this.logger.warn(QUERY_ROUTER_LOG_MSG.NO_CANDIDATES, {
          partitionId,
          correlationId,
          attempt,
        });

        // Refresh candidates on retry
        if (attempt < this.retryAttempts - 1) {
          await this.delay(this.calculateBackoffDelay(attempt));
          candidates = this.findServiceCandidates(partitionId, preferLeader, {
            preferSameLatencyGroup,
            localNodeId,
          });
          continue;
        }

        throw new Error(
          QUERY_ROUTER_ERROR_MSG.noServiceCandidates(partitionId),
        );
      }

      // Try routing to candidates
      const result = await this.tryRoute(
        candidates,
        message,
        correlationId,
        partitionId,
      );

      if (result.success) {
        this.logger.debug(QUERY_ROUTER_LOG_MSG.ROUTE_SUCCESS, {
          partitionId,
          correlationId,
          attempt,
        });
        return result;
      }

      // Handle leader redirect (Requirements 3.4)
      if (result.redirect && result.redirectAddress) {
        this.logger.debug(QUERY_ROUTER_LOG_MSG.FOLLOWING_REDIRECT, {
          partitionId,
          correlationId,
          redirectAddress: result.redirectAddress,
        });

        // Add redirect target to front of candidates
        candidates = [
          {address: result.redirectAddress},
          ...candidates.filter((c) => c.address !== result.redirectAddress),
        ];
        continue;
      }

      // Retry with backoff (Requirements 3.3)
      if (attempt < this.retryAttempts - 1) {
        const backoffDelay = this.calculateBackoffDelay(attempt);
        this.logger.debug(QUERY_ROUTER_LOG_MSG.RETRY_ATTEMPT, {
          partitionId,
          correlationId,
          attempt: attempt + 1,
          backoffDelay,
        });
        await this.delay(backoffDelay);

        // Refresh candidates for next attempt
        candidates = this.findServiceCandidates(partitionId, preferLeader, {
          preferSameLatencyGroup,
          localNodeId,
        });
      }
    }

    this.logger.error(QUERY_ROUTER_LOG_MSG.ROUTE_FAILED, {
      partitionId,
      correlationId,
      attempts: this.retryAttempts,
    });

    throw new Error(
      QUERY_ROUTER_ERROR_MSG.routingFailed(partitionId, this.retryAttempts),
    );
  }

  /**
   * Find service candidates for a partition.
   * Returns candidates ordered by preference (leader first if preferLeader).
   * Requirements: 3.2
   *
   * @param {string} partitionId - Partition ID to find candidates for
   * @param {boolean} [preferLeader=true] - Whether to prefer leader replicas
   * @return {Array<Object>} Array of service candidates with address and metadata
   */
  findServiceCandidates(partitionId, preferLeader = true, options = {}) {
    if (!this.systemCache ||
      typeof this.systemCache.filter !== 'function') {
      return [];
    }

    // Query services table for partition services
    const services = this.systemCache.filter(TABLES.SERVICES, (s) =>
      s.partition_id === partitionId &&
      s.service_type === SERVICE_TYPE.PARTITION &&
      s.status === SERVICE_STATUS.ACTIVE,
    ) || [];

    if (services.length === 0) {
      return [];
    }

    const localGroupId = this.resolveNodeLatencyGroupId(options.localNodeId);
    const preferSameLatencyGroup = options.preferSameLatencyGroup === true;
    const orderedServices = this.orderServicesByLatencyPreference(
      services,
      localGroupId,
      preferSameLatencyGroup,
    );
    const partitionRecord = this.getPartitionRecord(partitionId);
    const canonicalLeaderIdentity = this.resolveCanonicalPartitionLeaderIdentity(
      partitionId,
      orderedServices,
      partitionRecord,
    );
    const canonicalLeaderObservation = resolveCanonicalPartitionLeaderObservation(
      {
        partition: partitionRecord,
        partitionPresent: partitionRecord !== null,
        serviceRows: orderedServices,
        identitySnapshot: canonicalLeaderIdentity,
      },
    );
    const canonicalLeaderNodeId =
      typeof canonicalLeaderObservation.leaderNodeId === 'string' ?
        canonicalLeaderObservation.leaderNodeId :
        null;
    const candidates = [];
    const seen = new Set();

    /**
     * Add a service to candidates if not already seen.
     * @param {Object} service - Service to add
     */
    const addService = (service) => {
      if (!service || !service.address) {
        return;
      }
      const key = service.service_id || service.replica_id || service.address;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      candidates.push({
        address: service.address,
        nodeId: service.node_id,
        replicaId: service.service_id || service.replica_id,
        isLeader: service.raft_role === RAFT_ROLE.LEADER,
      });
    };

    if (preferLeader) {
      if (typeof canonicalLeaderNodeId === 'string' &&
        canonicalLeaderNodeId.length > 0) {
        orderedServices
          .filter((service) => service?.node_id === canonicalLeaderNodeId)
          .forEach(addService);
      }
    }

    // Add remaining services
    orderedServices.forEach(addService);

    return candidates;
  }

  /**
   * Resolve node latency-group assignment from cache.
   * @param {string|null} nodeId - Node ID.
   * @return {string|null}
   * @private
   */
  resolveNodeLatencyGroupId(nodeId) {
    if (!nodeId || typeof this.systemCache?.get !== 'function') {
      return null;
    }
    const nodeRow = this.systemCache.get(TABLES.NODES, nodeId);
    return nodeRow?.[COLUMN.LATENCY_GROUP_ID] || null;
  }

  /**
   * Resolve canonical partition row metadata from cache.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  getPartitionRecord(partitionId) {
    if (typeof partitionId !== 'string' ||
      partitionId.length === 0) {
      return null;
    }

    if (typeof this.systemCache?.get === 'function') {
      const partitionRow = this.systemCache.get(TABLES.PARTITIONS, partitionId);
      if (partitionRow) {
        return partitionRow;
      }
    }

    if (typeof this.systemCache?.filter === 'function') {
      return (this.systemCache.filter(TABLES.PARTITIONS, (partition) => {
        return partition?.[COLUMN.PARTITION_ID] === partitionId;
      }) || [])[0] || null;
    }

    return null;
  }

  /**
   * Resolve one canonical leader-identity snapshot for a partition.
   * Prefer the bootstrap owner's published authority answer, which may retain
   * the last stable priority owner during convergence, and only derive from a
   * unique leader-role service when owner evidence remains incomplete.
   * @param {string} partitionId
   * @param {Object[]} [serviceRows=[]]
   * @return {Object}
   * @private
   */
  resolveCanonicalPartitionLeaderIdentity(
    partitionId,
    serviceRows = [],
    partitionRow = null,
  ) {
    const resolvedPartitionRow = partitionRow || this.getPartitionRecord(partitionId);
    if (typeof this.bootstrapTopologySnapshotOwner
      ?.resolveCanonicalPartitionLeaderIdentity === 'function') {
      const ownerIdentity = this.bootstrapTopologySnapshotOwner
        .resolveCanonicalPartitionLeaderIdentity(partitionId, serviceRows);
      if (ownerIdentity && typeof ownerIdentity === 'object') {
        return ownerIdentity;
      }
    }

    let ownerLeaderNodeId = null;
    if (typeof this.bootstrapTopologySnapshotOwner
      ?.resolveCanonicalPartitionLeaderNodeId === 'function') {
      ownerLeaderNodeId = this.bootstrapTopologySnapshotOwner
        .resolveCanonicalPartitionLeaderNodeId(partitionId);
    }

    return resolveCanonicalLeaderIdentitySnapshot({
      partition: resolvedPartitionRow,
      partitionPresent: resolvedPartitionRow !== null,
      ownerLeaderNodeId,
      serviceRows,
    });
  }

  /**
   * Resolve canonical leader node metadata for one partition.
   * @param {string} partitionId
   * @param {Object[]} [serviceRows=[]]
   * @return {string|null}
   * @private
   */
  resolveCanonicalPartitionLeaderNodeId(partitionId, serviceRows = []) {
    return this.resolveCanonicalPartitionLeaderIdentity(
      partitionId,
      serviceRows,
    ).leaderNodeId;
  }

  /**
   * Order services to prefer same latency-group replicas when requested.
   * @param {Object[]} services - Partition service rows.
   * @param {string|null} localGroupId - Local latency group.
   * @param {boolean} preferSameLatencyGroup - Whether preference is enabled.
   * @return {Object[]}
   * @private
   */
  orderServicesByLatencyPreference(services, localGroupId, preferSameLatencyGroup) {
    if (!preferSameLatencyGroup || !localGroupId ||
      typeof this.systemCache?.get !== 'function') {
      return services;
    }

    const nodeGroupById = new Map();
    return [...services].sort((left, right) => {
      const leftNodeId = left?.node_id;
      const rightNodeId = right?.node_id;
      const leftGroupId = this.getNodeGroupFromCache(leftNodeId, nodeGroupById);
      const rightGroupId = this.getNodeGroupFromCache(rightNodeId, nodeGroupById);
      const leftPreferred = leftGroupId === localGroupId;
      const rightPreferred = rightGroupId === localGroupId;
      if (leftPreferred && !rightPreferred) {
        return -1;
      }
      if (!leftPreferred && rightPreferred) {
        return 1;
      }
      return 0;
    });
  }

  /**
   * Resolve and memoize node group assignments.
   * @param {string} nodeId - Node ID.
   * @param {Map<string, string|null>} nodeGroupById - Memoization map.
   * @return {string|null}
   * @private
   */
  getNodeGroupFromCache(nodeId, nodeGroupById) {
    if (!nodeId) {
      return null;
    }
    if (nodeGroupById.has(nodeId)) {
      return nodeGroupById.get(nodeId);
    }
    const nodeRow = this.systemCache.get(TABLES.NODES, nodeId);
    const groupId = nodeRow?.[COLUMN.LATENCY_GROUP_ID] || null;
    nodeGroupById.set(nodeId, groupId);
    return groupId;
  }

  /**
   * Try to route a message to one of the candidates.
   * Returns on first successful delivery or after trying all candidates.
   *
   * @param {Array<Object>} candidates - Service candidates to try
   * @param {Object} message - Message to route
   * @param {string} correlationId - Correlation ID for tracing
   * @param {string} partitionId - Partition ID for logging
   * @return {Promise<Object>} Result with success, redirect, or error info
   * @private
   */
  async tryRoute(candidates, message, correlationId, partitionId) {
    let lastError = null;

    for (const candidate of candidates) {
      const {address} = candidate;

      const response = await this.messageRouter.deliver(address, {
        ...message,
        correlationId,
      });

      // Check for successful response
      if (response.acknowledged && response.success) {
        return {
          success: true,
          response,
          correlationId,
          address,
        };
      }

      // Check for leader redirect (Requirements 3.4)
      if (response.redirect === QUERY_RESPONSE_TYPE.LEADER_REDIRECT &&
          response.leaderAddress) {
        return {
          success: false,
          redirect: true,
          redirectAddress: response.leaderAddress,
          correlationId,
        };
      }

      // Track error for reporting
      lastError = response.error || LOCAL_STR_UNKNOWN_ROUTING_ERROR;
    }

    return {
      success: false,
      error: lastError,
      correlationId,
      partitionId,
    };
  }

  /**
   * Calculate exponential backoff delay for retry attempts.
   * Requirements: 3.3
   *
   * @param {number} attempt - Current attempt number (0-indexed)
   * @return {number} Delay in milliseconds
   * @private
   */
  calculateBackoffDelay(attempt) {
    // Exponential backoff: baseDelay * 2^attempt
    return this.retryDelayMs * Math.pow(2, attempt);
  }

  /**
   * Delay helper for retry backoff.
   * @param {number} ms - Delay duration in milliseconds
   * @return {Promise<void>}
   * @private
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export {QueryRouter};
