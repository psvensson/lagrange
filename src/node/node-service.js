/**
 * Node Service - Administrative component present on every node.
 * Handles service lifecycle, health monitoring, and node statistics.
 * Requirements: 1.3, 2.3, 5.1, 5.4, 5.7
 */

import os from 'os';
import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {ServiceThreadManager, ServiceStatus} from '../threading/service-thread-manager.js';
import {AddressManager} from '../address/address-manager.js';
import {
  NodeLifecycleStateMachine,
  NodeState,
} from './node-lifecycle-state-machine.js';

/**
 * Node status enumeration.
 */
const NodeStatus = {
  INITIALIZING: 'initializing',
  ACTIVE: 'active',
  SUSPECTED: 'suspected',
  FAILED: 'failed',
  SHUTTING_DOWN: 'shutting_down',
  STOPPED: 'stopped',
};

/**
 * NodeService is the administrative component present on every node.
 * It manages service lifecycle, health monitoring, and node statistics.
 * Uses NodeLifecycleStateMachine for explicit state management.
 */
class NodeService extends EventEmitter {
  static instance = null;

  /**
   * Create a new NodeService instance.
   * @private
   */
  constructor() {
    super();
    this.nodeId = null;
    this.nodeAddress = null;
    this.status = NodeStatus.INITIALIZING;
    this.lifecycleStateMachine = null;
    this.services = new Map();
    this.messageGroupServices = new Map();
    this.heartbeatInterval = null;
    this.heartbeatIntervalMs = 5000;
    this.statsCollectionIntervalMs = 10000;
    this.statsInterval = null;
    this.lastStats = null;
    this.startTime = null;
    this.logger = null;
    this.config = null;
    this.threadManager = null;
    this.addressManager = null;
    this.initialized = false;
  }

  /**
   * Get the singleton instance.
   * @return {NodeService} The node service instance.
   */
  static getInstance() {
    if (!NodeService.instance) {
      NodeService.instance = new NodeService();
    }
    return NodeService.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (NodeService.instance) {
      NodeService.instance.shutdown().catch(() => {});
    }
    NodeService.instance = null;
  }

  /**
   * Initialize the node service.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Optional node ID (generated if not provided).
   * @param {string} options.nodeAddress - Optional node address.
   */
  initialize(options = {}) {
    if (this.initialized) {
      return;
    }

    this.config = ConfigurationManager.getInstance();
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem('node-service');

    // Set node identity
    this.nodeId = options.nodeId || this.config.get('node.id') || uuidv4();
    this.addressManager = AddressManager.getInstance();
    this.nodeAddress = options.nodeAddress ||
      this.addressManager.generateNodeAddress();

    // Get configuration values
    this.heartbeatIntervalMs = this.config.get('node.heartbeatIntervalMs') || 5000;
    this.statsCollectionIntervalMs =
      this.config.get('node.statsCollectionIntervalMs') || 10000;

    // Initialize thread manager
    this.threadManager = ServiceThreadManager.getInstance();
    if (!this.threadManager.isInitialized()) {
      this.threadManager.initialize();
    }

    // Initialize lifecycle state machine
    this.lifecycleStateMachine = new NodeLifecycleStateMachine({
      nodeId: this.nodeId,
      initialState: NodeState.STARTING,
    });

    // Forward state change events from the state machine
    this.lifecycleStateMachine.on('stateChange', (event) => {
      this._onLifecycleStateChange(event);
    });

    this.startTime = Date.now();

    // Transition through initial states: STARTING -> CONNECTING -> READY
    // For a simple initialization, we go directly to READY state
    // In a full cluster setup, this would go through CONNECTING, DISCOVERING, etc.
    this.lifecycleStateMachine.transition(NodeState.CONNECTING);
    this.lifecycleStateMachine.transition(NodeState.DISCOVERING);
    this.lifecycleStateMachine.transition(NodeState.JOINING);
    this.lifecycleStateMachine.transition(NodeState.SYNCING);
    this.lifecycleStateMachine.transition(NodeState.READY);

    // Update legacy status for backward compatibility
    this.status = NodeStatus.ACTIVE;
    this.initialized = true;

    this.logger.info('Node service initialized', {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      lifecycleState: this.lifecycleStateMachine.getState(),
    });
  }

  /**
   * Handle lifecycle state change events.
   * Emits CDC events for nodes table updates.
   * @param {Object} event - State change event.
   * @param {string} event.from - Previous state.
   * @param {string} event.to - New state.
   * @param {number} event.timestamp - Timestamp of the change.
   * @private
   */
  _onLifecycleStateChange(event) {
    this.logger.info('Node lifecycle state changed', {
      nodeId: this.nodeId,
      from: event.from,
      to: event.to,
      timestamp: event.timestamp,
    });

    // Forward the state change event for external listeners
    this.emit('lifecycleStateChange', {
      nodeId: this.nodeId,
      from: event.from,
      to: event.to,
      timestamp: event.timestamp,
    });

    // Emit CDC event for nodes table update
    // This allows other components to react to state changes
    this.emit('cdcNodeStateChange', {
      nodeId: this.nodeId,
      state: event.to,
      previousState: event.from,
      timestamp: event.timestamp,
    });
  }

  /**
   * Start a service on this node.
   * @param {Object} serviceConfig - Service configuration.
   * @param {string} serviceConfig.type - Service type (partition, messageGroup, custom).
   * @param {string} serviceConfig.id - Optional service ID (generated if not provided).
   * @param {Object} serviceConfig.config - Service-specific configuration.
   * @return {Promise<Object>} Service info with ID and status.
   */
  async startService(serviceConfig) {
    if (!this.initialized) {
      throw new Error('NodeService not initialized');
    }

    const serviceId = serviceConfig.id ||
      this.addressManager.generateServiceAddress(this.nodeAddress);
    const serviceType = serviceConfig.type || 'custom';

    if (this.services.has(serviceId)) {
      throw new Error(`Service already exists: ${serviceId}`);
    }

    this.logger.info('Starting service', {
      serviceId,
      serviceType,
      nodeId: this.nodeId,
    });

    const serviceInfo = {
      id: serviceId,
      type: serviceType,
      nodeId: this.nodeId,
      status: ServiceStatus.STARTING,
      config: serviceConfig.config || {},
      startedAt: Date.now(),
      lastHealthCheck: null,
      healthStatus: null,
    };

    this.services.set(serviceId, serviceInfo);

    try {
      // Register with thread manager
      await this.threadManager.registerService(serviceId, {
        handler: serviceConfig.handler || {},
      });

      serviceInfo.status = ServiceStatus.RUNNING;

      // Track message group services separately
      if (serviceType === 'messageGroup') {
        this.messageGroupServices.set(serviceId, serviceInfo);
      }

      this.logger.info('Service started', {
        serviceId,
        serviceType,
        nodeId: this.nodeId,
      });

      this.emit('serviceStarted', serviceId, serviceInfo);

      return {
        id: serviceId,
        type: serviceType,
        status: serviceInfo.status,
        nodeId: this.nodeId,
      };
    } catch (error) {
      serviceInfo.status = ServiceStatus.FAILED;
      this.logger.error('Failed to start service', {
        serviceId,
        serviceType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Stop a service on this node.
   * @param {string} serviceId - The service identifier.
   * @return {Promise<Object>} Result of the stop operation.
   */
  async stopService(serviceId) {
    if (!this.initialized) {
      throw new Error('NodeService not initialized');
    }

    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    this.logger.info('Stopping service', {
      serviceId,
      serviceType: serviceInfo.type,
      nodeId: this.nodeId,
    });

    serviceInfo.status = ServiceStatus.STOPPING;

    try {
      // Unregister from thread manager
      await this.threadManager.unregisterService(serviceId);

      // Remove from tracking
      this.services.delete(serviceId);
      this.messageGroupServices.delete(serviceId);

      // Unregister address
      this.addressManager.unregisterServiceAddress(serviceId);

      this.logger.info('Service stopped', {
        serviceId,
        nodeId: this.nodeId,
      });

      this.emit('serviceStopped', serviceId);

      return {
        id: serviceId,
        status: ServiceStatus.STOPPED,
        stoppedAt: Date.now(),
      };
    } catch (error) {
      serviceInfo.status = ServiceStatus.FAILED;
      this.logger.error('Failed to stop service', {
        serviceId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get node statistics including CPU, memory, and disk usage.
   * @return {Promise<Object>} Node statistics.
   */
  async getNodeStats() {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
      for (const type of Object.keys(cpu.times)) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    const cpuUsagePercent = ((totalTick - totalIdle) / totalTick) * 100;

    // Memory usage
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    // Get pool stats from thread manager
    const poolStats = this.threadManager?.getPoolStats() || {};

    const stats = {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      status: this.status,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
      cpu: {
        count: cpus.length,
        model: cpus[0]?.model || 'unknown',
        usagePercent: Math.round(cpuUsagePercent * 100) / 100,
      },
      memory: {
        totalBytes: totalMemory,
        usedBytes: usedMemory,
        freeBytes: freeMemory,
        usagePercent: Math.round(memoryUsagePercent * 100) / 100,
      },
      services: {
        total: this.services.size,
        running: this.getRunningServiceCount(),
        messageGroups: this.messageGroupServices.size,
      },
      threadPool: poolStats,
      platform: {
        os: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        hostname: os.hostname(),
      },
    };

    this.lastStats = stats;
    return stats;
  }

  /**
   * Get health status of a specific service.
   * @param {string} serviceId - The service identifier.
   * @return {Promise<Object>} Service health status.
   */
  async getServiceHealth(serviceId) {
    if (!this.initialized) {
      throw new Error('NodeService not initialized');
    }

    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    const health = await this.threadManager.checkServiceHealth(serviceId);

    serviceInfo.lastHealthCheck = Date.now();
    serviceInfo.healthStatus = health.healthy ? 'healthy' : 'unhealthy';

    return {
      serviceId,
      type: serviceInfo.type,
      status: serviceInfo.status,
      healthy: health.healthy,
      lastHealthCheck: serviceInfo.lastHealthCheck,
      details: health,
    };
  }

  /**
   * Route a message to a service.
   * @param {string} serviceId - The target service ID.
   * @param {Object} message - The message to route.
   * @return {Promise<*>} The response from the service.
   */
  async routeServiceMessage(serviceId, message) {
    if (!this.initialized) {
      throw new Error('NodeService not initialized');
    }

    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    if (serviceInfo.status !== ServiceStatus.RUNNING) {
      throw new Error(`Service not running: ${serviceId} (status: ${serviceInfo.status})`);
    }

    return await this.threadManager.executeServiceOperation(
      serviceId,
      message.operation || 'handleMessage',
      message.data || message,
    );
  }

  /**
   * Get service information.
   * @param {string} serviceId - The service identifier.
   * @return {Object|null} Service info or null if not found.
   */
  getService(serviceId) {
    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      return null;
    }

    return {
      id: serviceInfo.id,
      type: serviceInfo.type,
      nodeId: serviceInfo.nodeId,
      status: serviceInfo.status,
      startedAt: serviceInfo.startedAt,
      lastHealthCheck: serviceInfo.lastHealthCheck,
      healthStatus: serviceInfo.healthStatus,
    };
  }

  /**
   * Get all services on this node.
   * @return {Array<Object>} Array of service info objects.
   */
  getAllServices() {
    const services = [];
    for (const serviceInfo of this.services.values()) {
      services.push({
        id: serviceInfo.id,
        type: serviceInfo.type,
        nodeId: serviceInfo.nodeId,
        status: serviceInfo.status,
        startedAt: serviceInfo.startedAt,
        lastHealthCheck: serviceInfo.lastHealthCheck,
        healthStatus: serviceInfo.healthStatus,
      });
    }
    return services;
  }

  /**
   * Get the count of running services.
   * @return {number} Number of running services.
   */
  getRunningServiceCount() {
    let count = 0;
    for (const serviceInfo of this.services.values()) {
      if (serviceInfo.status === ServiceStatus.RUNNING) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get the node ID.
   * @return {string} The node ID.
   */
  getNodeId() {
    return this.nodeId;
  }

  /**
   * Get the node address.
   * @return {string} The node address.
   */
  getNodeAddress() {
    return this.nodeAddress;
  }

  /**
   * Get the node status.
   * @return {string} The node status.
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get the current lifecycle state from the state machine.
   * @return {string|null} The current lifecycle state, or null if not initialized.
   */
  getLifecycleState() {
    if (!this.lifecycleStateMachine) {
      return null;
    }
    return this.lifecycleStateMachine.getState();
  }

  /**
   * Get the lifecycle state machine instance.
   * @return {NodeLifecycleStateMachine|null} The state machine, or null if not initialized.
   */
  getLifecycleStateMachine() {
    return this.lifecycleStateMachine;
  }

  /**
   * Check if the node is in READY state (accepting traffic).
   * @return {boolean} True if node is ready.
   */
  isReady() {
    return this.lifecycleStateMachine?.isReady() || false;
  }

  /**
   * Check if the node is in DRAINING state.
   * @return {boolean} True if node is draining.
   */
  isDraining() {
    return this.lifecycleStateMachine?.isDraining() || false;
  }

  /**
   * Check if the node service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Check if the node has any local message group replicas.
   * @return {boolean} True if node has message group replicas.
   */
  hasLocalMessageGroupReplica() {
    return this.messageGroupServices.size > 0;
  }

  /**
   * Get the first active local message group replica.
   * @return {Object|null} Message group service info or null.
   */
  getLocalMessageGroupReplica() {
    for (const serviceInfo of this.messageGroupServices.values()) {
      if (serviceInfo.status === ServiceStatus.RUNNING) {
        return serviceInfo;
      }
    }
    return null;
  }

  /**
   * Shutdown the node service and all managed services.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (!this.initialized) {
      return;
    }

    this.logger.info('Shutting down node service', {nodeId: this.nodeId});
    this.status = NodeStatus.SHUTTING_DOWN;

    // Transition to DRAINING state if we're in READY state
    if (this.lifecycleStateMachine &&
        this.lifecycleStateMachine.getState() === NodeState.READY) {
      this.lifecycleStateMachine.transition(NodeState.DRAINING);
    }

    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    // Stop all services
    const serviceIds = Array.from(this.services.keys());
    for (const serviceId of serviceIds) {
      try {
        await this.stopService(serviceId);
      } catch (error) {
        this.logger.warn('Error stopping service during shutdown', {
          serviceId,
          error: error.message,
        });
      }
    }

    // Unregister node address
    if (this.nodeAddress) {
      this.addressManager.unregisterNodeAddress(this.nodeAddress);
    }

    // Transition to STOPPED state
    if (this.lifecycleStateMachine &&
        this.lifecycleStateMachine.getState() === NodeState.DRAINING) {
      this.lifecycleStateMachine.transition(NodeState.STOPPED);
    }

    // Clean up state machine event listeners
    if (this.lifecycleStateMachine) {
      this.lifecycleStateMachine.removeAllListeners();
    }

    this.status = NodeStatus.STOPPED;
    this.initialized = false;

    this.logger.info('Node service shutdown complete', {nodeId: this.nodeId});
    this.emit('shutdown', this.nodeId);
  }
}

export {NodeService, NodeStatus, NodeState};
