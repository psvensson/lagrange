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
import {SystemTableCache} from '../cache/system-table-cache.js';
import {createReadOnlyCache} from '../cache/read-only-system-table-cache.js';
import {
  NODE_CONFIG_KEY,
  NODE_LIFECYCLE_EVENT,
  NODE_SERVICE_DEFAULT,
  NODE_SERVICE_ERROR_MSG,
  NODE_SERVICE_EVENT,
  NODE_SERVICE_HEALTH_STATUS,
  NODE_SERVICE_LOG_MSG,
  NODE_SERVICE_SUBSYSTEM,
  NODE_STATUS,
} from './node-constants.js';
import {NUM, STRING} from '../constants/index.js';

/**
 * Node status enumeration.
 */
const NodeStatus = NODE_STATUS;

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
    this.status = NODE_STATUS.INITIALIZING;
    this.lifecycleStateMachine = null;
    this.lifecycleStateChangeHandler = (event) => {
      this._onLifecycleStateChange(event);
    };
    this.services = new Map();
    this.messageGroupServices = new Map();
    this.heartbeatInterval = null;
    this.heartbeatIntervalMs = NODE_SERVICE_DEFAULT.HEARTBEAT_INTERVAL_MS;
    this.statsCollectionIntervalMs = NODE_SERVICE_DEFAULT.STATS_COLLECTION_INTERVAL_MS;
    this.statsInterval = null;
    this.lastStats = null;
    this.startTime = null;
    this.logger = null;
    this.config = null;
    this.threadManager = null;
    this.addressManager = null;
    this.initialized = false;

    // System table cache - singleton per node, created once
    this._systemTableCache = null;
    this._readOnlyCache = null;
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
    this.logger = loggingService.forSubsystem(NODE_SERVICE_SUBSYSTEM);

    // Set node identity
    this.nodeId = options.nodeId || this.config.get(NODE_CONFIG_KEY.ID) || uuidv4();
    this.addressManager = AddressManager.getInstance();
    this.nodeAddress = options.nodeAddress ||
      this.addressManager.generateNodeAddress();

    // Get configuration values
    this.heartbeatIntervalMs =
      this.config.get(NODE_CONFIG_KEY.HEARTBEAT_INTERVAL_MS) ||
      NODE_SERVICE_DEFAULT.HEARTBEAT_INTERVAL_MS;
    this.statsCollectionIntervalMs =
      this.config.get(NODE_CONFIG_KEY.STATS_COLLECTION_INTERVAL_MS) ||
      NODE_SERVICE_DEFAULT.STATS_COLLECTION_INTERVAL_MS;

    // Initialize thread manager
    this.threadManager = ServiceThreadManager.getInstance();
    if (!this.threadManager.isInitialized()) {
      this.threadManager.initialize();
    }

    const providedLifecycleStateMachine = options.lifecycleStateMachine;
    const autoTransitionLifecycle = options.autoTransitionLifecycle !== false;
    // Initialize lifecycle state machine (or use externally managed one)
    this.bindLifecycleStateMachine(providedLifecycleStateMachine ||
      new NodeLifecycleStateMachine({
        nodeId: this.nodeId,
        initialState: NodeState.STARTING,
      }));

    this.startTime = Date.now();

    // Default node-service initialization owns lifecycle transitions.
    // Join/bootstrap flows can pass autoTransitionLifecycle=false and provide
    // an external lifecycle state machine to keep one lifecycle authority.
    if (autoTransitionLifecycle) {
      this.lifecycleStateMachine.transition(NodeState.CONNECTING);
      this.lifecycleStateMachine.transition(NodeState.DISCOVERING);
      this.lifecycleStateMachine.transition(NodeState.JOINING);
      this.lifecycleStateMachine.transition(NodeState.SYNCING);
      this.lifecycleStateMachine.transition(NodeState.READY);
    }

    this.status = NODE_STATUS.ACTIVE;
    this.initialized = true;

    this.logger.info(NODE_SERVICE_LOG_MSG.INITIALIZED, {
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
    this.logger.info(NODE_SERVICE_LOG_MSG.LIFECYCLE_STATE_CHANGED, {
      nodeId: this.nodeId,
      from: event.from,
      to: event.to,
      timestamp: event.timestamp,
    });

    // Forward the state change event for external listeners
    this.emit(NODE_SERVICE_EVENT.LIFECYCLE_STATE_CHANGE, {
      nodeId: this.nodeId,
      from: event.from,
      to: event.to,
      timestamp: event.timestamp,
    });

    // Emit CDC event for nodes table update
    // This allows other components to react to state changes
    this.emit(NODE_SERVICE_EVENT.CDC_NODE_STATE_CHANGE, {
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
      throw new Error(NODE_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const serviceId = serviceConfig.id ||
      this.addressManager.generateServiceAddress(this.nodeAddress);
    const serviceType = serviceConfig.type || NODE_SERVICE_DEFAULT.SERVICE_TYPE_CUSTOM;

    if (this.services.has(serviceId)) {
      throw new Error(`${NODE_SERVICE_ERROR_MSG.SERVICE_EXISTS}: ${serviceId}`);
    }

    this.logger.info(NODE_SERVICE_LOG_MSG.STARTING_SERVICE, {
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
      if (serviceType === NODE_SERVICE_DEFAULT.MESSAGE_GROUP_TYPE) {
        this.messageGroupServices.set(serviceId, serviceInfo);
      }

      this.logger.info(NODE_SERVICE_LOG_MSG.SERVICE_STARTED, {
        serviceId,
        serviceType,
        nodeId: this.nodeId,
      });

      this.emit(NODE_SERVICE_EVENT.SERVICE_STARTED, serviceId, serviceInfo);

      return {
        id: serviceId,
        type: serviceType,
        status: serviceInfo.status,
        nodeId: this.nodeId,
      };
    } catch (error) {
      serviceInfo.status = ServiceStatus.FAILED;
      this.logger.error(NODE_SERVICE_LOG_MSG.SERVICE_START_FAILED, {
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
      throw new Error(NODE_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      throw new Error(`${NODE_SERVICE_ERROR_MSG.SERVICE_NOT_FOUND}: ${serviceId}`);
    }

    this.logger.info(NODE_SERVICE_LOG_MSG.STOPPING_SERVICE, {
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

      this.logger.info(NODE_SERVICE_LOG_MSG.SERVICE_STOPPED, {
        serviceId,
        nodeId: this.nodeId,
      });

      this.emit(NODE_SERVICE_EVENT.SERVICE_STOPPED, serviceId);

      return {
        id: serviceId,
        status: ServiceStatus.STOPPED,
        stoppedAt: Date.now(),
      };
    } catch (error) {
      serviceInfo.status = ServiceStatus.FAILED;
      this.logger.error(NODE_SERVICE_LOG_MSG.SERVICE_STOP_FAILED, {
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
    const cpuUsagePercent = ((totalTick - totalIdle) / totalTick) * NUM.HUNDRED;

    // Memory usage
    const memoryUsagePercent = (usedMemory / totalMemory) * NUM.HUNDRED;

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
        model: cpus[0]?.model || STRING.UNKNOWN,
        usagePercent: Math.round(cpuUsagePercent * NUM.HUNDRED) / NUM.HUNDRED,
      },
      memory: {
        totalBytes: totalMemory,
        usedBytes: usedMemory,
        freeBytes: freeMemory,
        usagePercent: Math.round(memoryUsagePercent * NUM.HUNDRED) / NUM.HUNDRED,
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
      throw new Error(NODE_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      throw new Error(`${NODE_SERVICE_ERROR_MSG.SERVICE_NOT_FOUND}: ${serviceId}`);
    }

    const health = await this.threadManager.checkServiceHealth(serviceId);

    serviceInfo.lastHealthCheck = Date.now();
    serviceInfo.healthStatus = health.healthy ?
      NODE_SERVICE_HEALTH_STATUS.HEALTHY :
      NODE_SERVICE_HEALTH_STATUS.UNHEALTHY;

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
      throw new Error(NODE_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      throw new Error(`${NODE_SERVICE_ERROR_MSG.SERVICE_NOT_FOUND}: ${serviceId}`);
    }

    if (serviceInfo.status !== ServiceStatus.RUNNING) {
      throw new Error(
        `${NODE_SERVICE_ERROR_MSG.SERVICE_NOT_RUNNING}: ${serviceId} ` +
        `(status: ${serviceInfo.status})`,
      );
    }

    return await this.threadManager.executeServiceOperation(
      serviceId,
      message.operation || NODE_SERVICE_DEFAULT.OPERATION_HANDLER,
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
        count += 1;
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
   * Get the system table cache for this node.
   * Creates the cache on first access (lazy initialization).
   * The cache is a singleton per node - only created once.
   * @return {SystemTableCache} The writable system table cache.
   */
  getSystemTableCache() {
    if (!this._systemTableCache) {
      this._systemTableCache = new SystemTableCache();
      this._readOnlyCache = createReadOnlyCache(this._systemTableCache);
      if (this.logger) {
        this.logger.debug(NODE_SERVICE_LOG_MSG.SYSTEM_TABLE_CACHE_CREATED, {
          nodeId: this.nodeId,
        });
      }
    }
    return this._systemTableCache;
  }

  /**
   * Set the system cache proxy/cache instance for this node.
   * This preserves backward compatibility for tests and bootstrap wiring
   * that inject a pre-built cache/proxy instance.
   * @param {Object} cacheProxy - Cache or proxy instance.
   */
  setSystemCacheProxy(cacheProxy) {
    this._systemTableCache = cacheProxy;
    this._readOnlyCache = cacheProxy;
  }

  /**
   * Get the read-only view of the system table cache.
   * Creates the cache on first access if not already created.
   * @return {Object} Read-only proxy to the system table cache.
   */
  getReadOnlySystemTableCache() {
    if (!this._readOnlyCache) {
      // Ensure cache is created
      this.getSystemTableCache();
    }
    return this._readOnlyCache;
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
   * Replace an externally managed lifecycle machine without splitting the
   * NodeService observer from its bootstrap/join owner.
   * @param {NodeLifecycleStateMachine} expectedCurrent
   * @param {NodeLifecycleStateMachine} replacement
   * @return {boolean} True when the expected owner was replaced.
   */
  replaceExternallyManagedLifecycleStateMachine(
    expectedCurrent,
    replacement,
  ) {
    if (
      this.lifecycleStateMachine !== expectedCurrent ||
      !(replacement instanceof NodeLifecycleStateMachine)
    ) {
      return false;
    }
    this.bindLifecycleStateMachine(replacement);
    return true;
  }

  /**
   * Bind the lifecycle machine and forward only NodeService-owned events.
   * @param {NodeLifecycleStateMachine} lifecycleStateMachine
   * @return {void}
   * @private
   */
  bindLifecycleStateMachine(lifecycleStateMachine) {
    if (this.lifecycleStateMachine === lifecycleStateMachine) {
      return;
    }
    this.lifecycleStateMachine?.off(
      NODE_LIFECYCLE_EVENT.STATE_CHANGE,
      this.lifecycleStateChangeHandler,
    );
    this.lifecycleStateMachine = lifecycleStateMachine;
    this.lifecycleStateMachine.on(
      NODE_LIFECYCLE_EVENT.STATE_CHANGE,
      this.lifecycleStateChangeHandler,
    );
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

    this.logger.info(NODE_SERVICE_LOG_MSG.SHUTTING_DOWN, {nodeId: this.nodeId});
    this.status = NODE_STATUS.SHUTTING_DOWN;

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
        this.logger.warn(NODE_SERVICE_LOG_MSG.SHUTDOWN_SERVICE_STOP_FAILED, {
          serviceId,
          error: error.message,
        });
        throw error;
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

    // Release only the NodeService observer. An externally managed lifecycle
    // machine can have independent join/bootstrap listeners.
    if (this.lifecycleStateMachine) {
      this.lifecycleStateMachine.off(
        NODE_LIFECYCLE_EVENT.STATE_CHANGE,
        this.lifecycleStateChangeHandler,
      );
    }

    // Shutdown thread manager
    if (this.threadManager) {
      await this.threadManager.shutdown();
    }

    // Clear system table cache references
    this._systemTableCache = null;
    this._readOnlyCache = null;

    this.status = NODE_STATUS.STOPPED;
    this.initialized = false;

    this.logger.info(NODE_SERVICE_LOG_MSG.SHUTDOWN_COMPLETE, {nodeId: this.nodeId});
    this.emit(NODE_SERVICE_EVENT.SHUTDOWN, this.nodeId);
  }
}

export {NodeService, NodeStatus, NodeState};
