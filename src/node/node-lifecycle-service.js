/**
 * Node Lifecycle Service - Manages node lifecycle events via CDC.
 * Ensures all node state changes go through system table partitions.
 *
 * This service is a write-only helper for node registration, heartbeat,
 * and removal. Failure detection is owned solely by FailureDetector.
 *
 * Requirements: 5.6, 5.7, 5.8
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  NODE_CONFIG_KEY,
  NODE_LIFECYCLE_DEFAULT,
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
 *
 * This service handles write-only operations: registration, heartbeat
 * updates, and node removal. Failure detection (heartbeat timeout
 * checking, suspicion, failure marking) is the sole responsibility
 * of FailureDetector.
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
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.nodeId = options.nodeId || null;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.heartbeatIntervalMs =
      config.get(NODE_CONFIG_KEY.HEARTBEAT_INTERVAL_MS) ||
      NODE_LIFECYCLE_DEFAULT.HEARTBEAT_INTERVAL_MS;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(NODE_LIFECYCLE_SERVICE_SUBSYSTEM) : console;

    // Heartbeat timer
    this.heartbeatTimer = null;

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
    if (options.controlPlaneSystemTableGateway) {
      this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
    }

    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }

    if (!this.cdcIntegrationService && !this.controlPlaneSystemTableGateway) {
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
      cpu_cores: nodeData.cpu_cores || 0,
      memory_mb: nodeData.memory_mb || 0,
      disk_gb: nodeData.disk_gb || 0,
      cpu_usage_percent: nodeData.cpu_usage_percent || 0,
      memory_usage_percent: nodeData.memory_usage_percent || 0,
      disk_usage_percent: nodeData.disk_usage_percent || 0,
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
      const result = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: SYSTEM_TABLE_NAME.NODES,
        row: data,
      }, {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: 'critical',
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
      const result = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: SYSTEM_TABLE_NAME.NODES,
        whereClause: {node_id: nodeId},
        data: updateData,
      }, {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        deliveryPriority: 'background',
        allowPressureDefer: true,
        pressureRetryAfterMs: this.heartbeatIntervalMs,
        allowCoalescing: true,
        coalescingKey: `nodes:heartbeat:${nodeId}`,
      });

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
      const result = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
        tableName: SYSTEM_TABLE_NAME.NODES,
        whereClause: {node_id: nodeId},
      }, {
        workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
        deliveryPriority: 'critical',
      });

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
        this.emit(NODE_LIFECYCLE_SERVICE_EVENT.HEARTBEAT_ERROR, error);
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
   * @return {ControlPlaneSystemTableGateway}
   * @private
   */
  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getCdcIntegrationService: () => this.cdcIntegrationService,
      getMessageRouter: () => this.cdcIntegrationService?.messageRouter || null,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }

  /**
   * Shutdown the service.
   */
  shutdown() {
    this.stopHeartbeat();
    this.initialized = false;

    this.logger.info(NODE_LIFECYCLE_SERVICE_LOG_MSG.SHUTDOWN, {
      nodeId: this.nodeId,
    });
  }
}

export {NodeLifecycleService, NodeLifecycleStatus};
