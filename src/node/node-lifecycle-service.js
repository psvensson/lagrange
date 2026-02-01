/**
 * Node Lifecycle Service - Manages node lifecycle events via CDC.
 * Ensures all node state changes go through system table partitions.
 * Requirements: 5.6, 5.7, 5.8
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
import {NUM} from '../constants/index.js';
import {
  NODE_CONFIG_KEY,
  NODE_LIFECYCLE_DEFAULT,
  NODE_LIFECYCLE_REASON,
  NODE_LIFECYCLE_SERVICE_ERROR_MSG,
  NODE_LIFECYCLE_SERVICE_EVENT,
  NODE_LIFECYCLE_SERVICE_LOG_MSG,
  NODE_LIFECYCLE_SERVICE_SUBSYSTEM,
  NODE_STATUS,
} from './node-constants.js';

const NodeLifecycleStatus = NODE_STATUS;

/**
 * NodeLifecycleService manages node lifecycle events via CDC.
 * All node state changes go through the CDCIntegrationService to ensure
 * cache consistency across all nodes.
 */
class NodeLifecycleService extends EventEmitter {
  /**
   * Create a new NodeLifecycleService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {string} options.nodeId - This node's ID.
   */
  constructor(options = {}) {
    super();

    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.nodeId = options.nodeId || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.heartbeatIntervalMs =
      config.get(NODE_CONFIG_KEY.HEARTBEAT_INTERVAL_MS) ||
      NODE_LIFECYCLE_DEFAULT.HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimeoutMs =
      config.get(NODE_CONFIG_KEY.HEARTBEAT_TIMEOUT_MS) ||
      NODE_LIFECYCLE_DEFAULT.HEARTBEAT_TIMEOUT_MS;
    this.failureDetectionIntervalMs =
      config.get(NODE_CONFIG_KEY.FAILURE_DETECTION_INTERVAL_MS) ||
      NODE_LIFECYCLE_DEFAULT.FAILURE_DETECTION_INTERVAL_MS;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(NODE_LIFECYCLE_SERVICE_SUBSYSTEM) : console;

    // Heartbeat timer
    this.heartbeatTimer = null;
    this.failureDetectionTimer = null;

    // Track known nodes for failure detection
    this.knownNodes = new Map();

    this.initialized = false;
  }

  /**
   * Initialize the node lifecycle service.
   * @param {Object} options - Initialization options.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   * @param {string} options.nodeId - This node's ID.
   */
  initialize(options = {}) {
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }

    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }

    if (!this.cdcIntegrationService) {
      throw new Error(NODE_LIFECYCLE_SERVICE_ERROR_MSG.MISSING_CDC);
    }

    if (!this.nodeId) {
      throw new Error(NODE_LIFECYCLE_SERVICE_ERROR_MSG.MISSING_NODE_ID);
    }

    this.initialized = true;

    this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.INITIALIZED, {
      nodeId: this.nodeId,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
    });
  }

  /**
   * Register a new node in the cluster via CDC.
   * This writes the node entry to the nodes system table.
   *
   * @param {Object} nodeData - Node data to register.
   * @param {string} nodeData.node_id - Node ID.
   * @param {string} nodeData.node_address - Node address.
   * @param {number} nodeData.cpu_cores - CPU core count.
   * @param {number} nodeData.memory_mb - Memory in MB.
   * @param {number} nodeData.disk_gb - Disk in GB.
   * @return {Promise<Object>} Registration result.
   */
  async registerNode(nodeData) {
    this.validateInitialized();

    const now = Date.now();
    const data = {
      node_id: nodeData.node_id,
      node_address: nodeData.node_address,
      cpu_cores: nodeData.cpu_cores || NUM.ZERO,
      memory_mb: nodeData.memory_mb || NUM.ZERO,
      disk_gb: nodeData.disk_gb || NUM.ZERO,
      cpu_usage_percent: nodeData.cpu_usage_percent || NUM.ZERO,
      memory_usage_percent: nodeData.memory_usage_percent || NUM.ZERO,
      disk_usage_percent: nodeData.disk_usage_percent || NUM.ZERO,
      status: NODE_STATUS.ACTIVE,
      last_heartbeat: now,
      created_at: now,
      // Set id for cache compatibility
      id: nodeData.node_id,
    };

    this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.REGISTERING_NODE, {
      nodeId: data.node_id,
      nodeAddress: data.node_address,
    });

    try {
      const result = await this.cdcIntegrationService.insertSystemTableRow(
        SystemTableName.NODES,
        data,
      );

      // Track the node locally
      this.knownNodes.set(data.node_id, {
        ...data,
        lastHeartbeat: now,
      });

      this.emit(NODE_LIFECYCLE_SERVICE_EVENT.NODE_REGISTERED, {
        nodeId: data.node_id,
        nodeAddress: data.node_address,
      });

      return result;
    } catch (error) {
      this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.REGISTER_NODE_FAILED, {
        nodeId: data.node_id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update node heartbeat via CDC.
   * This updates the last_heartbeat timestamp in the nodes system table.
   *
   * @param {string} nodeId - Node ID to update.
   * @param {Object} stats - Optional node statistics to update.
   * @return {Promise<Object>} Update result.
   */
  async updateHeartbeat(nodeId, stats = {}) {
    this.validateInitialized();

    const now = Date.now();
    const updateData = {
      last_heartbeat: now,
    };

    // Include optional stats if provided
    if (stats.cpu_usage_percent !== undefined) {
      updateData.cpu_usage_percent = stats.cpu_usage_percent;
    }
    if (stats.memory_usage_percent !== undefined) {
      updateData.memory_usage_percent = stats.memory_usage_percent;
    }
    if (stats.disk_usage_percent !== undefined) {
      updateData.disk_usage_percent = stats.disk_usage_percent;
    }

    this.logger.debug(NODE_LIFECYCLE_SERVICE_LOG_MSG.UPDATING_HEARTBEAT, {
      nodeId,
      timestamp: now,
    });

    try {
      const result = await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.NODES,
        {node_id: nodeId},
        updateData,
      );

      // Update local tracking
      const knownNode = this.knownNodes.get(nodeId);
      if (knownNode) {
        knownNode.lastHeartbeat = now;
        Object.assign(knownNode, updateData);
      }

      this.emit(NODE_LIFECYCLE_SERVICE_EVENT.HEARTBEAT_UPDATED, {
        nodeId,
        timestamp: now,
      });

      return result;
    } catch (error) {
      this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.UPDATE_HEARTBEAT_FAILED, {
        nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark a node as failed via CDC.
   * This updates the node status in the nodes system table.
   *
   * @param {string} nodeId - Node ID to mark as failed.
   * @param {string} reason - Reason for failure.
   * @return {Promise<Object>} Update result.
   */
  async markNodeFailed(nodeId, reason = NODE_LIFECYCLE_REASON.HEARTBEAT_TIMEOUT) {
    this.validateInitialized();

    this.logger.warn(NODE_LIFECYCLE_SERVICE_LOG_MSG.MARKING_NODE_FAILED, {
      nodeId,
      reason,
    });

    try {
      const result = await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.NODES,
        {node_id: nodeId},
        {status: NodeLifecycleStatus.FAILED},
      );

      // Update local tracking
      const knownNode = this.knownNodes.get(nodeId);
      if (knownNode) {
        knownNode.status = NodeLifecycleStatus.FAILED;
      }

      this.emit(NODE_LIFECYCLE_SERVICE_EVENT.NODE_FAILED, {
        nodeId,
        reason,
      });

      return result;
    } catch (error) {
      this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.MARK_NODE_FAILED_FAILED, {
        nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark a node as suspected via CDC.
   * This is an intermediate state before marking as failed.
   *
   * @param {string} nodeId - Node ID to mark as suspected.
   * @return {Promise<Object>} Update result.
   */
  async markNodeSuspected(nodeId) {
    this.validateInitialized();

    this.logger.warn(NODE_LIFECYCLE_SERVICE_LOG_MSG.MARKING_NODE_SUSPECTED, {
      nodeId,
    });

    try {
      const result = await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.NODES,
        {node_id: nodeId},
        {status: NodeLifecycleStatus.SUSPECTED},
      );

      // Update local tracking
      const knownNode = this.knownNodes.get(nodeId);
      if (knownNode) {
        knownNode.status = NodeLifecycleStatus.SUSPECTED;
      }

      this.emit(NODE_LIFECYCLE_SERVICE_EVENT.NODE_SUSPECTED, {
        nodeId,
      });

      return result;
    } catch (error) {
      this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.MARK_NODE_SUSPECTED_FAILED, {
        nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark a node as active via CDC.
   * Used when a suspected node recovers.
   *
   * @param {string} nodeId - Node ID to mark as active.
   * @return {Promise<Object>} Update result.
   */
  async markNodeActive(nodeId) {
    this.validateInitialized();

    this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.MARKING_NODE_ACTIVE, {
      nodeId,
    });

    try {
      const result = await this.cdcIntegrationService.updateSystemTableRow(
        SystemTableName.NODES,
        {node_id: nodeId},
        {
          status: NodeLifecycleStatus.ACTIVE,
          last_heartbeat: Date.now(),
        },
      );

      // Update local tracking
      const knownNode = this.knownNodes.get(nodeId);
      if (knownNode) {
        knownNode.status = NodeLifecycleStatus.ACTIVE;
        knownNode.lastHeartbeat = Date.now();
      }

      this.emit(NODE_LIFECYCLE_SERVICE_EVENT.NODE_ACTIVE, {
        nodeId,
      });

      return result;
    } catch (error) {
      this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.MARK_NODE_ACTIVE_FAILED, {
        nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Remove a node from the cluster via CDC.
   *
   * @param {string} nodeId - Node ID to remove.
   * @return {Promise<Object>} Delete result.
   */
  async removeNode(nodeId) {
    this.validateInitialized();

    this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.REMOVING_NODE, {
      nodeId,
    });

    try {
      const result = await this.cdcIntegrationService.deleteSystemTableRow(
        SystemTableName.NODES,
        {node_id: nodeId},
      );

      // Remove from local tracking
      this.knownNodes.delete(nodeId);

      this.emit(NODE_LIFECYCLE_SERVICE_EVENT.NODE_REMOVED, {
        nodeId,
      });

      return result;
    } catch (error) {
      this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.REMOVE_NODE_FAILED, {
        nodeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Start periodic heartbeat updates for this node.
   */
  startHeartbeat() {
    this.validateInitialized();

    if (this.heartbeatTimer) {
      return;
    }

    this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.STARTING_HEARTBEAT, {
      nodeId: this.nodeId,
      intervalMs: this.heartbeatIntervalMs,
    });

    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.updateHeartbeat(this.nodeId);
      } catch (error) {
        this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.HEARTBEAT_FAILED, {
          nodeId: this.nodeId,
          error: error.message,
        });
        throw error;
      }
    }, this.heartbeatIntervalMs);
    this.heartbeatTimer.unref();
  }

  /**
   * Stop periodic heartbeat updates.
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;

      this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.STOPPED_HEARTBEAT, {
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Start failure detection for known nodes.
   * @param {Function} getNodesFromCache - Function to get nodes from cache.
   */
  startFailureDetection(getNodesFromCache) {
    this.validateInitialized();

    if (this.failureDetectionTimer) {
      return;
    }

    this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.STARTING_FAILURE_DETECTION, {
      nodeId: this.nodeId,
      intervalMs: this.failureDetectionIntervalMs,
      timeoutMs: this.heartbeatTimeoutMs,
    });

    this.failureDetectionTimer = setInterval(async () => {
      await this.detectFailedNodes(getNodesFromCache);
    }, this.failureDetectionIntervalMs);
    this.failureDetectionTimer.unref();
  }

  /**
   * Stop failure detection.
   */
  stopFailureDetection() {
    if (this.failureDetectionTimer) {
      clearInterval(this.failureDetectionTimer);
      this.failureDetectionTimer = null;

      this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.STOPPED_FAILURE_DETECTION, {
        nodeId: this.nodeId,
      });
    }
  }

  /**
   * Detect failed nodes based on heartbeat timeout.
   * @param {Function} getNodesFromCache - Function to get nodes from cache.
   * @return {Promise<void>}
   * @private
   */
  async detectFailedNodes(getNodesFromCache) {
    const now = Date.now();
    let nodes = [];

    // Get nodes from cache if function provided
    if (getNodesFromCache) {
      nodes = getNodesFromCache();
    } else {
      nodes = Array.from(this.knownNodes.values());
    }
    if (!Array.isArray(nodes)) {
      throw new Error(NODE_LIFECYCLE_SERVICE_ERROR_MSG.INVALID_NODES_CACHE);
    }

    for (const node of nodes) {
      // Skip this node
      if (node.node_id === this.nodeId) {
        continue;
      }

      // Skip already failed nodes
      if (node.status === NodeLifecycleStatus.FAILED) {
        continue;
      }

      const lastHeartbeat = node.last_heartbeat || node.lastHeartbeat || NUM.ZERO;
      const timeSinceHeartbeat = now - lastHeartbeat;

      if (timeSinceHeartbeat > this.heartbeatTimeoutMs) {
        if (node.status === NodeLifecycleStatus.SUSPECTED) {
          // Already suspected, now mark as failed
          this.logger.warn(NODE_LIFECYCLE_SERVICE_LOG_MSG.HEARTBEAT_TIMEOUT_FAILED, {
            nodeId: node.node_id,
            timeSinceHeartbeat,
            timeoutMs: this.heartbeatTimeoutMs,
          });

          try {
            await this.markNodeFailed(node.node_id, NODE_LIFECYCLE_REASON.HEARTBEAT_TIMEOUT);
          } catch (error) {
            this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.MARK_NODE_FAILED_FAILED, {
              nodeId: node.node_id,
              error: error.message,
            });
            throw error;
          }
        } else if (node.status === NodeLifecycleStatus.ACTIVE) {
          // First timeout, mark as suspected
          this.logger.warn(NODE_LIFECYCLE_SERVICE_LOG_MSG.HEARTBEAT_DELAYED_SUSPECTED, {
            nodeId: node.node_id,
            timeSinceHeartbeat,
            timeoutMs: this.heartbeatTimeoutMs,
          });

          try {
            await this.markNodeSuspected(node.node_id);
          } catch (error) {
            this.logger.error(NODE_LIFECYCLE_SERVICE_LOG_MSG.MARK_NODE_SUSPECTED_FAILED, {
              nodeId: node.node_id,
              error: error.message,
            });
            throw error;
          }
        }
      }
    }
  }

  /**
   * Validate that the service is initialized.
   * @throws {Error} If not initialized.
   * @private
   */
  validateInitialized() {
    if (!this.initialized) {
      throw new Error(NODE_LIFECYCLE_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get known nodes.
   * @return {Map} Known nodes map.
   */
  getKnownNodes() {
    return new Map(this.knownNodes);
  }

  /**
   * Shutdown the service.
   */
  shutdown() {
    this.stopHeartbeat();
    this.stopFailureDetection();
    this.knownNodes.clear();
    this.initialized = false;

    this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
    });
  }
}

export {NodeLifecycleService, NodeLifecycleStatus};
