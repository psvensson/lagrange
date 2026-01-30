/**
 * Node Reintegration Service - Reintegrates recovered nodes into the cluster.
 * Triggers rebalancing after node recovery.
 * Requirements: 14.4
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {NUM} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  NODE_REINTEGRATION_DEFAULT,
  NODE_REINTEGRATION_ERROR_MSG,
  NODE_REINTEGRATION_EVENT,
  NODE_REINTEGRATION_LOG_MSG,
  NODE_REINTEGRATION_REASON,
  NODE_REINTEGRATION_STATUS,
  NODE_REINTEGRATION_SUBSYSTEM,
  NODE_STATUS,
} from './node-constants.js';

const NodeStatus = NODE_STATUS;
const ReintegrationStatus = NODE_REINTEGRATION_STATUS;

/**
 * NodeReintegrationService monitors for recovering nodes and reintegrates them.
 * It marks nodes as active after successful reintegration and triggers
 * rebalancing to redistribute replicas.
 */
class NodeReintegrationService extends EventEmitter {
  /**
   * Create a new NodeReintegrationService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - Read-only system table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service for writes.
   * @param {string} options.nodeId - This node's ID.
   */
  constructor(options = {}) {
    super();

    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.nodeId = options.nodeId || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.checkIntervalMs =
      config.get(CONFIG_KEY.NODE_REINTEGRATION_CHECK_INTERVAL_MS) ||
      NODE_REINTEGRATION_DEFAULT.CHECK_INTERVAL_MS;
    this.reintegrationDelayMs =
      config.get(CONFIG_KEY.NODE_REINTEGRATION_DELAY_MS) ||
      NODE_REINTEGRATION_DEFAULT.REINTEGRATION_DELAY_MS;
    this.healthCheckCount =
      config.get(CONFIG_KEY.NODE_REINTEGRATION_HEALTH_CHECK_COUNT) ||
      NODE_REINTEGRATION_DEFAULT.HEALTH_CHECK_COUNT;
    this.healthCheckIntervalMs =
      config.get(CONFIG_KEY.NODE_REINTEGRATION_HEALTH_CHECK_INTERVAL_MS) ||
      NODE_REINTEGRATION_DEFAULT.HEALTH_CHECK_INTERVAL_MS;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(NODE_REINTEGRATION_SUBSYSTEM) : console;

    // State
    this.checkTimer = null;
    this.pendingReintegrations = new Map(); // nodeId -> reintegration info
    this.cleanupTimers = new Map(); // nodeId -> cleanup timer
    this.reintegrationCount = NUM.ZERO;

    this.initialized = false;
  }

  /**
   * Initialize the node reintegration service.
   * @param {Object} options - Initialization options.
   */
  initialize(options = {}) {
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }
    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }

    if (!this.nodeId) {
      throw new Error(NODE_REINTEGRATION_ERROR_MSG.MISSING_NODE_ID);
    }
    this.systemTableCache = assertCritical(
      this.systemTableCache,
      NODE_REINTEGRATION_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );
    this.cdcIntegrationService = assertCritical(
      this.cdcIntegrationService,
      NODE_REINTEGRATION_ERROR_MSG.MISSING_CDC_SERVICE,
    );

    this.initialized = true;

    this.logger.info(NODE_REINTEGRATION_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      checkIntervalMs: this.checkIntervalMs,
      healthCheckCount: this.healthCheckCount,
    });
  }

  /**
   * Start the node reintegration monitoring loop.
   */
  start() {
    if (!this.initialized) {
      throw new Error(NODE_REINTEGRATION_ERROR_MSG.NOT_INITIALIZED);
    }

    if (this.checkTimer) {
      return; // Already running
    }

    this.logger.info(NODE_REINTEGRATION_LOG_MSG.STARTING_MONITORING, {
      nodeId: this.nodeId,
      intervalMs: this.checkIntervalMs,
    });

    this.checkTimer = setInterval(async () => {
      try {
        await this.checkRecoveringNodes();
      } catch (error) {
        if (error?.isCritical) {
          throw error;
        }
        this.logger.error(NODE_REINTEGRATION_LOG_MSG.CHECK_ERROR, {
          nodeId: this.nodeId,
          error: error.message,
        });
      }
    }, this.checkIntervalMs);
  }

  /**
   * Stop the node reintegration monitoring loop.
   */
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.logger.info(NODE_REINTEGRATION_LOG_MSG.STOPPED_MONITORING, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Check for recovering nodes and process reintegration.
   * @return {Promise<void>}
   */
  async checkRecoveringNodes() {
    const nodes = this.getNodes();

    for (const node of nodes) {
      // Skip self
      if (node.node_id === this.nodeId) {
        continue;
      }

      // Process recovering nodes
    if (node.status === NODE_STATUS.RECOVERING) {
      await this.processRecoveringNode(node);
    }
    }
  }

  /**
   * Process a recovering node for reintegration.
   * @param {Object} node - Node in recovering state.
   * @return {Promise<void>}
   * @private
   */
  async processRecoveringNode(node) {
    const nodeId = node.node_id;

    // Check if already processing this node
    if (this.pendingReintegrations.has(nodeId)) {
      const pending = this.pendingReintegrations.get(nodeId);
      if (pending.status === ReintegrationStatus.IN_PROGRESS) {
        return; // Already in progress
      }
    }

    // Start reintegration process
    this.logger.info(NODE_REINTEGRATION_LOG_MSG.STARTING_REINTEGRATION, {
      nodeId,
      recoveredAt: node.recovered_at,
    });

    this.pendingReintegrations.set(nodeId, {
      nodeId,
      status: ReintegrationStatus.IN_PROGRESS,
      startedAt: Date.now(),
      healthChecks: NUM.ZERO,
    });

    try {
      // Verify node health with multiple checks
      const isHealthy = await this.verifyNodeHealth(node);

      if (isHealthy) {
        await this.completeReintegration(node);
      } else {
        await this.failReintegration(node, NODE_REINTEGRATION_REASON.HEALTH_CHECK_FAILED);
      }
    } catch (error) {
      await this.failReintegration(node, error.message);
    }
  }

  /**
   * Verify node health with multiple consecutive checks.
   * @param {Object} node - Node to verify.
   * @return {Promise<boolean>} True if node is healthy.
   * @private
   */
  async verifyNodeHealth(node) {
    const nodeId = node.node_id;
    let successfulChecks = NUM.ZERO;

    for (let i = NUM.ZERO; i < this.healthCheckCount; i += NUM.ONE) {
      // Wait between checks
      if (i > NUM.ZERO) {
        await this.sleep(this.healthCheckIntervalMs);
      }

      // Check if node is still sending heartbeats
      const currentNode = this.getNode(nodeId);
      if (!currentNode) {
        this.logger.warn(NODE_REINTEGRATION_LOG_MSG.NODE_NOT_FOUND, {nodeId});
        return false;
      }

      const now = Date.now();
      const lastHeartbeat = currentNode.last_heartbeat || NUM.ZERO;
      const timeSinceHeartbeat = now - lastHeartbeat;

      // Consider healthy if heartbeat within last 10 seconds
      if (timeSinceHeartbeat < NODE_REINTEGRATION_DEFAULT.HEALTHY_HEARTBEAT_WINDOW_MS) {
        successfulChecks += NUM.ONE;
        this.logger.debug(NODE_REINTEGRATION_LOG_MSG.HEALTH_CHECK_PASSED, {
          nodeId,
          check: i + NUM.ONE,
          total: this.healthCheckCount,
          timeSinceHeartbeat,
        });
      } else {
        this.logger.warn(NODE_REINTEGRATION_LOG_MSG.HEALTH_CHECK_FAILED, {
          nodeId,
          check: i + NUM.ONE,
          total: this.healthCheckCount,
          timeSinceHeartbeat,
        });
        return false;
      }

      // Update pending reintegration
      const pending = this.pendingReintegrations.get(nodeId);
      if (pending) {
        pending.healthChecks = successfulChecks;
      }
    }

    return successfulChecks === this.healthCheckCount;
  }

  /**
   * Complete node reintegration.
   * @param {Object} node - Node to reintegrate.
   * @return {Promise<void>}
   * @private
   */
  async completeReintegration(node) {
    const nodeId = node.node_id;
    const now = Date.now();

    this.logger.info(NODE_REINTEGRATION_LOG_MSG.COMPLETING_REINTEGRATION, {
      nodeId,
      downtime: now - (node.failed_at || node.recovered_at || now),
    });

    // Mark node as active
    try {
      await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.NODES,
        {node_id: nodeId},
        {
          status: NodeStatus.ACTIVE,
          reintegrated_at: now,
          updated_at: now,
        },
      );
    } catch (error) {
      this.logger.error(NODE_REINTEGRATION_LOG_MSG.MARK_NODE_ACTIVE_FAILED, {
        nodeId,
        error: error.message,
      });
      throw error;
    }

    // Update pending reintegration status
    const pending = this.pendingReintegrations.get(nodeId);
    if (pending) {
      pending.status = ReintegrationStatus.COMPLETED;
      pending.completedAt = now;
    }

    this.reintegrationCount += NUM.ONE;

    // Emit events
    this.emit(NODE_REINTEGRATION_EVENT.NODE_REINTEGRATED, {
      nodeId,
      timestamp: now,
    });

    // Trigger rebalancing
    this.emit(NODE_REINTEGRATION_EVENT.TRIGGER_REBALANCING, {
      nodeId,
      reason: NODE_REINTEGRATION_REASON.NODE_REINTEGRATION,
      timestamp: now,
    });

    this.logger.info(NODE_REINTEGRATION_LOG_MSG.REINTEGRATION_COMPLETED, {
      nodeId,
      message: NODE_REINTEGRATION_LOG_MSG.REBALANCER_NOTICE,
    });

    // Clean up pending reintegration after a delay
    const cleanupTimer = setTimeout(() => {
      this.pendingReintegrations.delete(nodeId);
      this.cleanupTimers.delete(nodeId);
    }, NODE_REINTEGRATION_DEFAULT.CLEANUP_DELAY_MS);
    this.cleanupTimers.set(nodeId, cleanupTimer);
  }

  /**
   * Handle failed reintegration.
   * @param {Object} node - Node that failed reintegration.
   * @param {string} reason - Reason for failure.
   * @return {Promise<void>}
   * @private
   */
  async failReintegration(node, reason) {
    const nodeId = node.node_id;

    this.logger.error(NODE_REINTEGRATION_LOG_MSG.REINTEGRATION_FAILED, {
      nodeId,
      reason,
    });

    // Update pending reintegration status
    const pending = this.pendingReintegrations.get(nodeId);
    if (pending) {
      pending.status = NODE_REINTEGRATION_STATUS.FAILED;
      pending.failedAt = Date.now();
      pending.failureReason = reason;
    }

    // Mark node back to failed status if health checks failed
    if (reason === NODE_REINTEGRATION_REASON.HEALTH_CHECK_FAILED) {
      try {
        await this.cdcIntegrationService.updateSystemTableRow(
          SystemTableName.NODES,
          {node_id: nodeId},
          {
            status: NodeStatus.FAILED,
            updated_at: Date.now(),
          },
        );
      } catch (error) {
        this.logger.error(NODE_REINTEGRATION_LOG_MSG.MARK_NODE_FAILED_FAILED, {
          nodeId,
          error: error.message,
        });
        throw error;
      }
    }

    this.emit(NODE_REINTEGRATION_EVENT.REINTEGRATION_FAILED, {
      nodeId,
      reason,
    });

    // Clean up pending reintegration after a delay
    const cleanupTimer = setTimeout(() => {
      this.pendingReintegrations.delete(nodeId);
      this.cleanupTimers.delete(nodeId);
    }, NODE_REINTEGRATION_DEFAULT.CLEANUP_DELAY_MS);
    this.cleanupTimers.set(nodeId, cleanupTimer);
  }

  /**
   * Get all nodes from cache.
   * @return {Array<Object>} Array of node objects.
   * @private
   */
  getNodes() {
    assertCritical(
      this.systemTableCache,
      NODE_REINTEGRATION_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );

    return this.systemTableCache.getAll(SystemTableName.NODES);
  }

  /**
   * Get a specific node from cache.
   * @param {string} nodeId - Node ID.
   * @return {Object|null} Node object or null.
   * @private
   */
  getNode(nodeId) {
    assertCritical(
      this.systemTableCache,
      NODE_REINTEGRATION_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
    );

    const nodes = this.systemTableCache.filter(SystemTableName.NODES, (node) => {
      return node.node_id === nodeId;
    });
    return nodes[NUM.ZERO] || null;
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

  /**
   * Get node reintegration statistics.
   * @return {Object} Statistics object.
   */
  getStats() {
    return {
      nodeId: this.nodeId,
      checkIntervalMs: this.checkIntervalMs,
      healthCheckCount: this.healthCheckCount,
      pendingReintegrations: this.pendingReintegrations.size,
      reintegrationCount: this.reintegrationCount,
      isRunning: this.checkTimer !== null,
      initialized: this.initialized,
    };
  }

  /**
   * Get pending reintegrations.
   * @return {Array<Object>} Array of pending reintegration info.
   */
  getPendingReintegrations() {
    return Array.from(this.pendingReintegrations.values());
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Check if service is running.
   * @return {boolean} True if running.
   */
  isRunning() {
    return this.checkTimer !== null;
  }

  /**
   * Shutdown the node reintegration service.
   */
  shutdown() {
    this.stop();

    // Clear all cleanup timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();

    this.pendingReintegrations.clear();
    this.initialized = false;

    this.logger.info(NODE_REINTEGRATION_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
      totalReintegrations: this.reintegrationCount,
    });
  }
}

export {
  NodeReintegrationService,
  NodeStatus,
  NODE_REINTEGRATION_STATUS as ReintegrationStatus,
};
