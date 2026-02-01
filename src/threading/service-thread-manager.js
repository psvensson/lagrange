/**
 * Service Thread Manager - Worker thread pool management with piscina.
 * Provides service isolation and message passing between main thread and workers.
 * Requirements: 2.3, 2.4
 */

import {Piscina} from 'piscina';
import {EventEmitter} from 'events';
import path from 'path';
import {fileURLToPath} from 'url';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';
import {
  SERVICE_STATUS,
  THREADING_CONFIG_KEY,
  THREADING_DEFAULT,
  THREADING_ERROR_MSG,
  THREADING_HEALTH_STATUS,
  THREADING_EVENT,
  THREADING_LOG_MSG,
  THREADING_SUBSYSTEM,
  WORKER_OPERATION,
} from './threading-constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ServiceThreadManager manages worker thread pool for service execution.
 * Uses piscina for high-performance thread pool management.
 */
class ServiceThreadManager extends EventEmitter {
  static instance = null;

  /**
   * Create a new ServiceThreadManager instance.
   * @private
   */
  constructor() {
    super();
    this.pool = null;
    this.services = new Map();
    this.initialized = false;
    this.logger = null;
    this.config = null;
  }

  /**
   * Get the singleton instance.
   * @return {ServiceThreadManager} The service thread manager instance.
   */
  static getInstance() {
    if (!ServiceThreadManager.instance) {
      ServiceThreadManager.instance = new ServiceThreadManager();
    }
    return ServiceThreadManager.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (ServiceThreadManager.instance) {
      ServiceThreadManager.instance.shutdown().catch(() => {});
    }
    ServiceThreadManager.instance = null;
  }

  /**
   * Initialize the service thread manager.
   * @param {Object} options - Configuration options.
   * @param {number} options.minThreads - Minimum number of worker threads.
   * @param {number} options.maxThreads - Maximum number of worker threads.
   * @param {number} options.idleTimeoutMs - Idle timeout for workers in ms.
   * @param {number} options.taskQueueSize - Maximum task queue size.
   */
  initialize(options = {}) {
    if (this.initialized) {
      return;
    }

    this.config = ConfigurationManager.getInstance();
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.forSubsystem(THREADING_SUBSYSTEM);

    const minThreads = options.minThreads ||
      this.config.get(THREADING_CONFIG_KEY.MIN_THREADS) || THREADING_DEFAULT.MIN_THREADS;
    const maxThreads = options.maxThreads ||
      this.config.get(THREADING_CONFIG_KEY.MAX_THREADS) || THREADING_DEFAULT.MAX_THREADS;
    const idleTimeoutMs = options.idleTimeoutMs ||
      this.config.get(THREADING_CONFIG_KEY.IDLE_TIMEOUT_MS) || THREADING_DEFAULT.IDLE_TIMEOUT_MS;

    // Create piscina thread pool
    this.pool = new Piscina({
      filename: path.join(__dirname, 'service-worker.js'),
      minThreads,
      maxThreads,
      idleTimeout: idleTimeoutMs,
    });

    // Set up pool event handlers
    this.pool.on('error', (error) => {
      this.logger.error(THREADING_LOG_MSG.POOL_ERROR, {error: error.message});
      this.emit(THREADING_EVENT.POOL_ERROR, error);
    });

    this.logger.info(THREADING_LOG_MSG.INITIALIZED, {
      minThreads,
      maxThreads,
      idleTimeoutMs,
    });

    this.initialized = true;
  }

  /**
   * Execute a service operation in the worker pool.
   * @param {string} serviceId - The target service ID.
   * @param {string} operation - The operation to perform.
   * @param {*} data - The operation data.
   * @return {Promise<*>} The operation result.
   */
  async executeServiceOperation(serviceId, operation, data = {}) {
    if (!this.initialized) {
      throw new Error(THREADING_ERROR_MSG.NOT_INITIALIZED);
    }

    const startTime = Date.now();

    try {
      const result = await this.pool.run({
        serviceId,
        operation,
        data,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(THREADING_LOG_MSG.OPERATION_COMPLETED, {
        serviceId,
        operation,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(THREADING_LOG_MSG.OPERATION_FAILED, {
        serviceId,
        operation,
        durationMs: duration,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Register a service in the thread pool.
   * @param {string} serviceId - The service identifier.
   * @param {Object} serviceConfig - The service configuration.
   * @return {Promise<Object>} Registration result.
   */
  async registerService(serviceId, serviceConfig = {}) {
    if (!this.initialized) {
      throw new Error(THREADING_ERROR_MSG.NOT_INITIALIZED);
    }

    if (this.services.has(serviceId)) {
      throw new Error(THREADING_ERROR_MSG.serviceAlreadyRegistered(serviceId));
    }

    const serviceInfo = {
      id: serviceId,
      config: serviceConfig,
      status: SERVICE_STATUS.PENDING,
      registeredAt: Date.now(),
      lastHealthCheck: null,
      healthStatus: null,
    };

    this.services.set(serviceId, serviceInfo);

    try {
      const result = await this.executeServiceOperation(serviceId, WORKER_OPERATION.REGISTER, {
        handler: serviceConfig.handler || {},
      });

      serviceInfo.status = SERVICE_STATUS.RUNNING;
      this.logger.info(THREADING_LOG_MSG.SERVICE_REGISTERED, {serviceId});
      this.emit(THREADING_EVENT.SERVICE_REGISTERED, serviceId);

      return result;
    } catch (error) {
      serviceInfo.status = SERVICE_STATUS.FAILED;
      this.logger.error(THREADING_LOG_MSG.SERVICE_REGISTRATION_FAILED, {
        serviceId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Unregister a service from the thread pool.
   * @param {string} serviceId - The service identifier.
   * @return {Promise<Object>} Unregistration result.
   */
  async unregisterService(serviceId) {
    if (!this.initialized) {
      throw new Error(THREADING_ERROR_MSG.NOT_INITIALIZED);
    }

    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      throw new Error(THREADING_ERROR_MSG.serviceNotFound(serviceId));
    }

    serviceInfo.status = SERVICE_STATUS.STOPPING;

    try {
      const result = await this.executeServiceOperation(serviceId, WORKER_OPERATION.UNREGISTER);
      this.services.delete(serviceId);

      this.logger.info(THREADING_LOG_MSG.SERVICE_UNREGISTERED, {serviceId});
      this.emit(THREADING_EVENT.SERVICE_UNREGISTERED, serviceId);

      return result;
    } catch (error) {
      serviceInfo.status = SERVICE_STATUS.FAILED;
      this.logger.error(THREADING_LOG_MSG.SERVICE_UNREGISTRATION_FAILED, {
        serviceId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get service status.
   * @param {string} serviceId - The service identifier.
   * @return {Object|null} Service status or null if not found.
   */
  getServiceStatus(serviceId) {
    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      return null;
    }

    return {
      id: serviceInfo.id,
      status: serviceInfo.status,
      registeredAt: serviceInfo.registeredAt,
      lastHealthCheck: serviceInfo.lastHealthCheck,
      healthStatus: serviceInfo.healthStatus,
    };
  }

  /**
   * Check health of a service.
   * @param {string} serviceId - The service identifier.
   * @return {Promise<Object>} Health check result.
   */
  async checkServiceHealth(serviceId) {
    if (!this.initialized) {
      throw new Error(THREADING_ERROR_MSG.NOT_INITIALIZED);
    }

    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      throw new Error(THREADING_ERROR_MSG.serviceNotFound(serviceId));
    }

    try {
      const result = await this.executeServiceOperation(serviceId, WORKER_OPERATION.PING);
      serviceInfo.lastHealthCheck = Date.now();
      serviceInfo.healthStatus = THREADING_HEALTH_STATUS.HEALTHY;

      return {
        serviceId,
        healthy: true,
        ...result,
      };
    } catch (error) {
      serviceInfo.lastHealthCheck = Date.now();
      serviceInfo.healthStatus = THREADING_HEALTH_STATUS.UNHEALTHY;

      return {
        serviceId,
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Get all registered services.
   * @return {Array<Object>} Array of service status objects.
   */
  getAllServices() {
    const services = [];
    for (const [serviceId, serviceInfo] of this.services) {
      services.push({
        id: serviceId,
        status: serviceInfo.status,
        registeredAt: serviceInfo.registeredAt,
        lastHealthCheck: serviceInfo.lastHealthCheck,
        healthStatus: serviceInfo.healthStatus,
      });
    }
    return services;
  }

  /**
   * Get the number of registered services.
   * @return {number} Number of registered services.
   */
  getServiceCount() {
    return this.services.size;
  }

  /**
   * Get thread pool statistics.
   * @return {Object} Pool statistics.
   */
  getPoolStats() {
    if (!this.pool) {
      return null;
    }

    return {
      threads: this.pool.threads?.length || 0,
      completed: this.pool.completed || 0,
      runTime: this.pool.runTime || 0,
      waitTime: this.pool.waitTime || 0,
      queueSize: this.pool.queueSize || 0,
    };
  }

  /**
   * Check if the manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Shutdown the thread pool and cleanup resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (!this.initialized) {
      return;
    }

    this.logger.info(THREADING_LOG_MSG.SHUTDOWN_START);

    // Unregister all services
    const serviceIds = Array.from(this.services.keys());
    for (const serviceId of serviceIds) {
      try {
        await this.unregisterService(serviceId);
      } catch (error) {
        this.logger.warn(THREADING_LOG_MSG.SHUTDOWN_UNREGISTER_ERROR, {
          serviceId,
          error: error.message,
        });
        throw error;
      }
    }

    // Destroy the pool
    if (this.pool) {
      await this.pool.destroy();
      this.pool = null;
    }

    this.initialized = false;
    this.logger.info(THREADING_LOG_MSG.SHUTDOWN_COMPLETE);
  }
}

export {ServiceThreadManager};
export {SERVICE_STATUS as ServiceStatus};
