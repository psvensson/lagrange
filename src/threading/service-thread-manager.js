/**
 * Service Thread Manager - Worker thread pool management with piscina.
 * Provides service isolation and message passing between main thread and workers.
 * Requirements: 2.3, 2.4
 */

import {Piscina} from 'piscina';
import {EventEmitter} from 'events';
import os from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Service status enumeration.
 */
const ServiceStatus = {
  PENDING: 'pending',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  FAILED: 'failed',
};

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
    this.logger = loggingService.forSubsystem('threading');

    const minThreads = options.minThreads ||
      this.config.get('worker.minThreads') || 2;
    const maxThreads = options.maxThreads ||
      this.config.get('worker.maxThreads') || os.cpus().length;
    const idleTimeoutMs = options.idleTimeoutMs ||
      this.config.get('worker.idleTimeoutMs') || 30000;

    // Create piscina thread pool
    this.pool = new Piscina({
      filename: path.join(__dirname, 'service-worker.js'),
      minThreads,
      maxThreads,
      idleTimeout: idleTimeoutMs,
    });

    // Set up pool event handlers
    this.pool.on('error', (error) => {
      this.logger.error('Worker pool error', {error: error.message});
      this.emit('poolError', error);
    });

    this.logger.info('Service thread manager initialized', {
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
      throw new Error('ServiceThreadManager not initialized');
    }

    const startTime = Date.now();

    try {
      const result = await this.pool.run({
        serviceId,
        operation,
        data,
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Service operation completed', {
        serviceId,
        operation,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Service operation failed', {
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
      throw new Error('ServiceThreadManager not initialized');
    }

    if (this.services.has(serviceId)) {
      throw new Error(`Service already registered: ${serviceId}`);
    }

    const serviceInfo = {
      id: serviceId,
      config: serviceConfig,
      status: ServiceStatus.PENDING,
      registeredAt: Date.now(),
      lastHealthCheck: null,
      healthStatus: null,
    };

    this.services.set(serviceId, serviceInfo);

    try {
      const result = await this.executeServiceOperation(serviceId, 'register', {
        handler: serviceConfig.handler || {},
      });

      serviceInfo.status = ServiceStatus.RUNNING;
      this.logger.info('Service registered', {serviceId});
      this.emit('serviceRegistered', serviceId);

      return result;
    } catch (error) {
      serviceInfo.status = ServiceStatus.FAILED;
      this.logger.error('Service registration failed', {
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
      throw new Error('ServiceThreadManager not initialized');
    }

    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    serviceInfo.status = ServiceStatus.STOPPING;

    try {
      const result = await this.executeServiceOperation(serviceId, 'unregister');
      this.services.delete(serviceId);

      this.logger.info('Service unregistered', {serviceId});
      this.emit('serviceUnregistered', serviceId);

      return result;
    } catch (error) {
      serviceInfo.status = ServiceStatus.FAILED;
      this.logger.error('Service unregistration failed', {
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
      throw new Error('ServiceThreadManager not initialized');
    }

    const serviceInfo = this.services.get(serviceId);
    if (!serviceInfo) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    try {
      const result = await this.executeServiceOperation(serviceId, 'ping');
      serviceInfo.lastHealthCheck = Date.now();
      serviceInfo.healthStatus = 'healthy';

      return {
        serviceId,
        healthy: true,
        ...result,
      };
    } catch (error) {
      serviceInfo.lastHealthCheck = Date.now();
      serviceInfo.healthStatus = 'unhealthy';

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

    this.logger.info('Shutting down service thread manager');

    // Unregister all services
    const serviceIds = Array.from(this.services.keys());
    for (const serviceId of serviceIds) {
      try {
        await this.unregisterService(serviceId);
      } catch (error) {
        this.logger.warn('Error unregistering service during shutdown', {
          serviceId,
          error: error.message,
        });
      }
    }

    // Destroy the pool
    if (this.pool) {
      await this.pool.destroy();
      this.pool = null;
    }

    this.initialized = false;
    this.logger.info('Service thread manager shutdown complete');
  }
}

export {ServiceThreadManager, ServiceStatus};
