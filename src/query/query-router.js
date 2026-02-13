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
  SERVICE_TYPE,
  STATE,
  TABLES,
  NUM,
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
import {ConfigurationManager} from '../config/configuration-manager.js';

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

    for (let attempt = NUM.ZERO; attempt < this.retryAttempts; attempt++) {
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
      if (candidates.length === NUM.ZERO) {
        this.logger.warn(QUERY_ROUTER_LOG_MSG.NO_CANDIDATES, {
          partitionId,
          correlationId,
          attempt,
        });

        // Refresh candidates on retry
        if (attempt < this.retryAttempts - NUM.ONE) {
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
      if (attempt < this.retryAttempts - NUM.ONE) {
        const backoffDelay = this.calculateBackoffDelay(attempt);
        this.logger.debug(QUERY_ROUTER_LOG_MSG.RETRY_ATTEMPT, {
          partitionId,
          correlationId,
          attempt: attempt + NUM.ONE,
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
    if (!this.systemCache || typeof this.systemCache.filter !== 'function') {
      return [];
    }

    // Query services table for partition services
    const services = this.systemCache.filter(TABLES.SERVICES, (s) =>
      s.partition_id === partitionId &&
      s.service_type === SERVICE_TYPE.PARTITION &&
      s.status === STATE.ACTIVE,
    ) || [];

    if (services.length === NUM.ZERO) {
      return [];
    }

    const localGroupId = this.resolveNodeLatencyGroupId(options.localNodeId);
    const preferSameLatencyGroup = options.preferSameLatencyGroup === true;
    const orderedServices = this.orderServicesByLatencyPreference(
      services,
      localGroupId,
      preferSameLatencyGroup,
    );
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
      // Add leaders first
      const leaders = orderedServices.filter((s) => s.raft_role === RAFT_ROLE.LEADER);
      leaders.forEach(addService);
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
        return NUM.NEGATIVE_ONE;
      }
      if (!leftPreferred && rightPreferred) {
        return NUM.ONE;
      }
      return NUM.ZERO;
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
      lastError = response.error || 'Unknown routing error';
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
    return this.retryDelayMs * Math.pow(NUM.TWO, attempt);
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
