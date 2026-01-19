/**
 * Node Reintegration Service - Reintegrates recovered nodes into the cluster.
 * Triggers rebalancing after node recovery.
 * Requirements: 14.4
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas.js';

/**
 * Node status values.
 */
const NodeStatus = {
  ACTIVE: 'active',
  SUSPECTED: 'suspected',
  FAILED: 'failed',
  RECOVERING: 'recovering',
};

/**
 * Reintegration status values.
 */
const ReintegrationStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

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
    this.checkIntervalMs = config.get('nodeReintegration.checkIntervalMs') || 10000;
    this.reintegrationDelayMs =
      config.get('nodeReintegration.reintegrationDelayMs') || 5000;
    this.healthCheckCount =
      config.get('nodeReintegration.healthCheckCount') || 3;
    this.healthCheckIntervalMs =
      config.get('nodeReintegration.healthCheckIntervalMs') || 2000;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('node-reintegration') : console;

    // State
    this.checkTimer = null;
    this.pendingReintegrations = new Map(); // nodeId -> reintegration info
    this.cleanupTimers = new Map(); // nodeId -> cleanup timer
    this.reintegrationCount = 0;

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
      throw new Error('NodeReintegrationService requires nodeId');
    }

    this.initialized = true;

    this.logger.info('Node reintegration service initialized', {
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
      throw new Error('NodeReintegrationService not initialized');
    }

    if (this.checkTimer) {
      return; // Already running
    }

    this.logger.info('Starting node reintegration monitoring', {
      nodeId: this.nodeId,
      intervalMs: this.checkIntervalMs,
    });

    this.checkTimer = setInterval(async () => {
      try {
        await this.checkRecoveringNodes();
      } catch (error) {
        this.logger.error('Error during node reintegration check', {
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

    this.logger.info('Stopped node reintegration monitoring', {
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
      if (node.status === NodeStatus.RECOVERING) {
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
    this.logger.info('Starting node reintegration', {
      nodeId,
      recoveredAt: node.recovered_at,
    });

    this.pendingReintegrations.set(nodeId, {
      nodeId,
      status: ReintegrationStatus.IN_PROGRESS,
      startedAt: Date.now(),
      healthChecks: 0,
    });

    try {
      // Verify node health with multiple checks
      const isHealthy = await this.verifyNodeHealth(node);

      if (isHealthy) {
        await this.completeReintegration(node);
      } else {
        await this.failReintegration(node, 'health_check_failed');
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
    let successfulChecks = 0;

    for (let i = 0; i < this.healthCheckCount; i++) {
      // Wait between checks
      if (i > 0) {
        await this.sleep(this.healthCheckIntervalMs);
      }

      // Check if node is still sending heartbeats
      const currentNode = this.getNode(nodeId);
      if (!currentNode) {
        this.logger.warn('Node not found during health check', {nodeId});
        return false;
      }

      const now = Date.now();
      const lastHeartbeat = currentNode.last_heartbeat || 0;
      const timeSinceHeartbeat = now - lastHeartbeat;

      // Consider healthy if heartbeat within last 10 seconds
      if (timeSinceHeartbeat < 10000) {
        successfulChecks++;
        this.logger.debug('Node health check passed', {
          nodeId,
          check: i + 1,
          total: this.healthCheckCount,
          timeSinceHeartbeat,
        });
      } else {
        this.logger.warn('Node health check failed', {
          nodeId,
          check: i + 1,
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

    this.logger.info('Completing node reintegration', {
      nodeId,
      downtime: now - (node.failed_at || node.recovered_at || now),
    });

    // Mark node as active
    if (this.cdcIntegrationService) {
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
        this.logger.error('Failed to mark node as active', {
          nodeId,
          error: error.message,
        });
        throw error;
      }
    }

    // Update pending reintegration status
    const pending = this.pendingReintegrations.get(nodeId);
    if (pending) {
      pending.status = ReintegrationStatus.COMPLETED;
      pending.completedAt = now;
    }

    this.reintegrationCount++;

    // Emit events
    this.emit('nodeReintegrated', {
      nodeId,
      timestamp: now,
    });

    // Trigger rebalancing
    this.emit('triggerRebalancing', {
      nodeId,
      reason: 'node_reintegration',
      timestamp: now,
    });

    this.logger.info('Node reintegration completed', {
      nodeId,
      message: 'Rebalancer will gradually restore replicas to this node',
    });

    // Clean up pending reintegration after a delay
    const cleanupTimer = setTimeout(() => {
      this.pendingReintegrations.delete(nodeId);
      this.cleanupTimers.delete(nodeId);
    }, 60000);
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

    this.logger.error('Node reintegration failed', {
      nodeId,
      reason,
    });

    // Update pending reintegration status
    const pending = this.pendingReintegrations.get(nodeId);
    if (pending) {
      pending.status = ReintegrationStatus.FAILED;
      pending.failedAt = Date.now();
      pending.failureReason = reason;
    }

    // Mark node back to failed status if health checks failed
    if (this.cdcIntegrationService && reason === 'health_check_failed') {
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
        this.logger.error('Failed to mark node as failed', {
          nodeId,
          error: error.message,
        });
      }
    }

    this.emit('reintegrationFailed', {
      nodeId,
      reason,
    });

    // Clean up pending reintegration after a delay
    const cleanupTimer = setTimeout(() => {
      this.pendingReintegrations.delete(nodeId);
      this.cleanupTimers.delete(nodeId);
    }, 60000);
    this.cleanupTimers.set(nodeId, cleanupTimer);
  }

  /**
   * Get all nodes from cache.
   * @return {Array<Object>} Array of node objects.
   * @private
   */
  getNodes() {
    if (!this.systemTableCache) {
      return [];
    }

    try {
      return this.systemTableCache.getAll('nodes') || [];
    } catch (_error) {
      return [];
    }
  }

  /**
   * Get a specific node from cache.
   * @param {string} nodeId - Node ID.
   * @return {Object|null} Node object or null.
   * @private
   */
  getNode(nodeId) {
    if (!this.systemTableCache) {
      return null;
    }

    try {
      const nodes = this.systemTableCache.filter('nodes', (node) => {
        return node.node_id === nodeId;
      }) || [];
      return nodes[0] || null;
    } catch (_error) {
      return null;
    }
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

    this.logger.info('Node reintegration service shutdown', {
      nodeId: this.nodeId,
      totalReintegrations: this.reintegrationCount,
    });
  }
}

export {
  NodeReintegrationService,
  NodeStatus,
  ReintegrationStatus,
};
