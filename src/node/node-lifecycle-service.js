/**
 * Node Lifecycle Service - Manages node lifecycle events via CDC.
 * Ensures all node state changes go through system table partitions.
 * Requirements: 5.6, 5.7, 5.8
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SystemTableName} from '../bootstrap/system-table-schemas.js';

/**
 * Node status enumeration.
 */
const NodeLifecycleStatus = {
  ACTIVE: 'active',
  SUSPECTED: 'suspected',
  FAILED: 'failed',
  SHUTTING_DOWN: 'shutting_down',
  STOPPED: 'stopped',
};

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
    this.heartbeatIntervalMs = config.get('node.heartbeatIntervalMs') || 5000;
    this.heartbeatTimeoutMs = config.get('node.heartbeatTimeoutMs') || 15000;
    this.failureDetectionIntervalMs =
      config.get('node.failureDetectionIntervalMs') || 10000;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('node-lifecycle') : console;

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
      throw new Error(
        'NodeLifecycleService requires cdcIntegrationService',
      );
    }

    if (!this.nodeId) {
      throw new Error('NodeLifecycleService requires nodeId');
    }

    this.initialized = true;

    this.logger.info('Node lifecycle service initialized', {
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
      cpu_cores: nodeData.cpu_cores || 0,
      memory_mb: nodeData.memory_mb || 0,
      disk_gb: nodeData.disk_gb || 0,
      cpu_usage_percent: nodeData.cpu_usage_percent || 0,
      memory_usage_percent: nodeData.memory_usage_percent || 0,
      disk_usage_percent: nodeData.disk_usage_percent || 0,
      status: NodeLifecycleStatus.ACTIVE,
      last_heartbeat: now,
      created_at: now,
      // Set id for cache compatibility
      id: nodeData.node_id,
    };

    this.logger.info('Registering node via CDC', {
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

      this.emit('nodeRegistered', {
        nodeId: data.node_id,
        nodeAddress: data.node_address,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to register node via CDC', {
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

    this.logger.debug('Updating node heartbeat via CDC', {
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

      this.emit('heartbeatUpdated', {
        nodeId,
        timestamp: now,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to update heartbeat via CDC', {
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
  async markNodeFailed(nodeId, reason = 'heartbeat_timeout') {
    this.validateInitialized();

    this.logger.warn('Marking node as failed via CDC', {
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

      this.emit('nodeFailed', {
        nodeId,
        reason,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to mark node as failed via CDC', {
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

    this.logger.warn('Marking node as suspected via CDC', {
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

      this.emit('nodeSuspected', {
        nodeId,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to mark node as suspected via CDC', {
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

    this.logger.info('Marking node as active via CDC', {
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

      this.emit('nodeActive', {
        nodeId,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to mark node as active via CDC', {
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

    this.logger.info('Removing node via CDC', {
      nodeId,
    });

    try {
      const result = await this.cdcIntegrationService.deleteSystemTableRow(
        SystemTableName.NODES,
        {node_id: nodeId},
      );

      // Remove from local tracking
      this.knownNodes.delete(nodeId);

      this.emit('nodeRemoved', {
        nodeId,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to remove node via CDC', {
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

    this.logger.info('Starting heartbeat timer', {
      nodeId: this.nodeId,
      intervalMs: this.heartbeatIntervalMs,
    });

    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.updateHeartbeat(this.nodeId);
      } catch (error) {
        this.logger.error('Heartbeat update failed', {
          nodeId: this.nodeId,
          error: error.message,
        });
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop periodic heartbeat updates.
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;

      this.logger.info('Stopped heartbeat timer', {
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

    this.logger.info('Starting failure detection', {
      nodeId: this.nodeId,
      intervalMs: this.failureDetectionIntervalMs,
      timeoutMs: this.heartbeatTimeoutMs,
    });

    this.failureDetectionTimer = setInterval(async () => {
      try {
        await this.detectFailedNodes(getNodesFromCache);
      } catch (error) {
        this.logger.error('Failure detection error', {
          nodeId: this.nodeId,
          error: error.message,
        });
      }
    }, this.failureDetectionIntervalMs);
  }

  /**
   * Stop failure detection.
   */
  stopFailureDetection() {
    if (this.failureDetectionTimer) {
      clearInterval(this.failureDetectionTimer);
      this.failureDetectionTimer = null;

      this.logger.info('Stopped failure detection', {
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
      try {
        nodes = getNodesFromCache() || [];
      } catch {
        // Use local tracking if cache unavailable
        nodes = Array.from(this.knownNodes.values());
      }
    } else {
      nodes = Array.from(this.knownNodes.values());
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

      const lastHeartbeat = node.last_heartbeat || node.lastHeartbeat || 0;
      const timeSinceHeartbeat = now - lastHeartbeat;

      if (timeSinceHeartbeat > this.heartbeatTimeoutMs) {
        if (node.status === NodeLifecycleStatus.SUSPECTED) {
          // Already suspected, now mark as failed
          this.logger.warn('Node heartbeat timeout, marking as failed', {
            nodeId: node.node_id,
            timeSinceHeartbeat,
            timeoutMs: this.heartbeatTimeoutMs,
          });

          try {
            await this.markNodeFailed(node.node_id, 'heartbeat_timeout');
          } catch (error) {
            this.logger.error('Failed to mark node as failed', {
              nodeId: node.node_id,
              error: error.message,
            });
          }
        } else if (node.status === NodeLifecycleStatus.ACTIVE) {
          // First timeout, mark as suspected
          this.logger.warn('Node heartbeat delayed, marking as suspected', {
            nodeId: node.node_id,
            timeSinceHeartbeat,
            timeoutMs: this.heartbeatTimeoutMs,
          });

          try {
            await this.markNodeSuspected(node.node_id);
          } catch (error) {
            this.logger.error('Failed to mark node as suspected', {
              nodeId: node.node_id,
              error: error.message,
            });
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
      throw new Error('NodeLifecycleService not initialized');
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

    this.logger.info('Node lifecycle service shutdown', {
      nodeId: this.nodeId,
    });
  }
}

export {NodeLifecycleService, NodeLifecycleStatus};
