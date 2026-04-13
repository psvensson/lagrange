/**
 * Service Thread Manager - Worker thread pool management with piscina.
 * Provides service isolation and message passing between main thread and workers.
 * Requirements: 2.3, 2.4
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { Piscina } from 'piscina';
import { EventEmitter } from 'events';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { resolveModuleDirectory, resolvePackagedRuntimeFile } from '../sea/runtime-file-resolution.js';
import { SERVICE_STATUS, THREADING_CONFIG_KEY, THREADING_DEFAULT, THREADING_ERROR_MSG, THREADING_HEALTH_STATUS, THREADING_EVENT, THREADING_LOG_MSG, THREADING_SUBSYSTEM, WORKER_OPERATION } from './threading-constants.js';
const THREADING_MODULE_DIR = resolveModuleDirectory(resolveModuleDirectory);
function resolveServiceWorkerPath() {
  if (stryMutAct_9fa48("152350")) {
    {}
  } else {
    stryCov_9fa48("152350");
    return resolvePackagedRuntimeFile(stryMutAct_9fa48("152351") ? {} : (stryCov_9fa48("152351"), {
      moduleDir: THREADING_MODULE_DIR,
      sourceFileName: stryMutAct_9fa48("152352") ? "" : (stryCov_9fa48("152352"), 'service-worker.js'),
      bundledFileName: stryMutAct_9fa48("152353") ? "" : (stryCov_9fa48("152353"), 'service-worker.bundle.cjs')
    }));
  }
}

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
    this.initialized = stryMutAct_9fa48("152354") ? true : (stryCov_9fa48("152354"), false);
    this.logger = null;
    this.config = null;
  }

  /**
   * Get the singleton instance.
   * @return {ServiceThreadManager} The service thread manager instance.
   */
  static getInstance() {
    if (stryMutAct_9fa48("152355")) {
      {}
    } else {
      stryCov_9fa48("152355");
      if (stryMutAct_9fa48("152358") ? false : stryMutAct_9fa48("152357") ? true : stryMutAct_9fa48("152356") ? ServiceThreadManager.instance : (stryCov_9fa48("152356", "152357", "152358"), !ServiceThreadManager.instance)) {
        if (stryMutAct_9fa48("152359")) {
          {}
        } else {
          stryCov_9fa48("152359");
          ServiceThreadManager.instance = new ServiceThreadManager();
        }
      }
      return ServiceThreadManager.instance;
    }
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (stryMutAct_9fa48("152360")) {
      {}
    } else {
      stryCov_9fa48("152360");
      const instance = ServiceThreadManager.instance;
      if (stryMutAct_9fa48("152363") ? false : stryMutAct_9fa48("152362") ? true : stryMutAct_9fa48("152361") ? instance : (stryCov_9fa48("152361", "152362", "152363"), !instance)) {
        if (stryMutAct_9fa48("152364")) {
          {}
        } else {
          stryCov_9fa48("152364");
          return;
        }
      }
      if (stryMutAct_9fa48("152367") ? instance.pool || typeof instance.pool.destroy === 'function' : stryMutAct_9fa48("152366") ? false : stryMutAct_9fa48("152365") ? true : (stryCov_9fa48("152365", "152366", "152367"), instance.pool && (stryMutAct_9fa48("152369") ? typeof instance.pool.destroy !== 'function' : stryMutAct_9fa48("152368") ? true : (stryCov_9fa48("152368", "152369"), typeof instance.pool.destroy === (stryMutAct_9fa48("152370") ? "" : (stryCov_9fa48("152370"), 'function')))))) {
        if (stryMutAct_9fa48("152371")) {
          {}
        } else {
          stryCov_9fa48("152371");
          instance.pool.destroy().catch(() => {});
        }
      }
      instance.pool = null;
      instance.services.clear();
      instance.initialized = stryMutAct_9fa48("152372") ? true : (stryCov_9fa48("152372"), false);
      instance.removeAllListeners();
      ServiceThreadManager.instance = null;
    }
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
    if (stryMutAct_9fa48("152373")) {
      {}
    } else {
      stryCov_9fa48("152373");
      if (stryMutAct_9fa48("152375") ? false : stryMutAct_9fa48("152374") ? true : (stryCov_9fa48("152374", "152375"), this.initialized)) {
        if (stryMutAct_9fa48("152376")) {
          {}
        } else {
          stryCov_9fa48("152376");
          return;
        }
      }
      this.config = ConfigurationManager.getInstance();
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.forSubsystem(THREADING_SUBSYSTEM);
      const minThreads = stryMutAct_9fa48("152379") ? (options.minThreads || this.config.get(THREADING_CONFIG_KEY.MIN_THREADS)) && THREADING_DEFAULT.MIN_THREADS : stryMutAct_9fa48("152378") ? false : stryMutAct_9fa48("152377") ? true : (stryCov_9fa48("152377", "152378", "152379"), (stryMutAct_9fa48("152381") ? options.minThreads && this.config.get(THREADING_CONFIG_KEY.MIN_THREADS) : stryMutAct_9fa48("152380") ? false : (stryCov_9fa48("152380", "152381"), options.minThreads || this.config.get(THREADING_CONFIG_KEY.MIN_THREADS))) || THREADING_DEFAULT.MIN_THREADS);
      const maxThreads = stryMutAct_9fa48("152384") ? (options.maxThreads || this.config.get(THREADING_CONFIG_KEY.MAX_THREADS)) && THREADING_DEFAULT.MAX_THREADS : stryMutAct_9fa48("152383") ? false : stryMutAct_9fa48("152382") ? true : (stryCov_9fa48("152382", "152383", "152384"), (stryMutAct_9fa48("152386") ? options.maxThreads && this.config.get(THREADING_CONFIG_KEY.MAX_THREADS) : stryMutAct_9fa48("152385") ? false : (stryCov_9fa48("152385", "152386"), options.maxThreads || this.config.get(THREADING_CONFIG_KEY.MAX_THREADS))) || THREADING_DEFAULT.MAX_THREADS);
      const idleTimeoutMs = stryMutAct_9fa48("152389") ? (options.idleTimeoutMs || this.config.get(THREADING_CONFIG_KEY.IDLE_TIMEOUT_MS)) && THREADING_DEFAULT.IDLE_TIMEOUT_MS : stryMutAct_9fa48("152388") ? false : stryMutAct_9fa48("152387") ? true : (stryCov_9fa48("152387", "152388", "152389"), (stryMutAct_9fa48("152391") ? options.idleTimeoutMs && this.config.get(THREADING_CONFIG_KEY.IDLE_TIMEOUT_MS) : stryMutAct_9fa48("152390") ? false : (stryCov_9fa48("152390", "152391"), options.idleTimeoutMs || this.config.get(THREADING_CONFIG_KEY.IDLE_TIMEOUT_MS))) || THREADING_DEFAULT.IDLE_TIMEOUT_MS);

      // Create piscina thread pool
      this.pool = new Piscina(stryMutAct_9fa48("152392") ? {} : (stryCov_9fa48("152392"), {
        filename: resolveServiceWorkerPath(),
        minThreads,
        maxThreads,
        idleTimeout: idleTimeoutMs
      }));

      // Set up pool event handlers
      this.pool.on(stryMutAct_9fa48("152393") ? "" : (stryCov_9fa48("152393"), 'error'), error => {
        if (stryMutAct_9fa48("152394")) {
          {}
        } else {
          stryCov_9fa48("152394");
          this.logger.error(THREADING_LOG_MSG.POOL_ERROR, stryMutAct_9fa48("152395") ? {} : (stryCov_9fa48("152395"), {
            error: error.message
          }));
          this.emit(THREADING_EVENT.POOL_ERROR, error);
        }
      });
      this.logger.info(THREADING_LOG_MSG.INITIALIZED, stryMutAct_9fa48("152396") ? {} : (stryCov_9fa48("152396"), {
        minThreads,
        maxThreads,
        idleTimeoutMs
      }));
      this.initialized = stryMutAct_9fa48("152397") ? false : (stryCov_9fa48("152397"), true);
    }
  }

  /**
   * Execute a service operation in the worker pool.
   * @param {string} serviceId - The target service ID.
   * @param {string} operation - The operation to perform.
   * @param {*} data - The operation data.
   * @return {Promise<*>} The operation result.
   */
  async executeServiceOperation(serviceId, operation, data = {}) {
    if (stryMutAct_9fa48("152398")) {
      {}
    } else {
      stryCov_9fa48("152398");
      if (stryMutAct_9fa48("152401") ? false : stryMutAct_9fa48("152400") ? true : stryMutAct_9fa48("152399") ? this.initialized : (stryCov_9fa48("152399", "152400", "152401"), !this.initialized)) {
        if (stryMutAct_9fa48("152402")) {
          {}
        } else {
          stryCov_9fa48("152402");
          throw new Error(THREADING_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const startTime = Date.now();
      try {
        if (stryMutAct_9fa48("152403")) {
          {}
        } else {
          stryCov_9fa48("152403");
          const result = await this.pool.run(stryMutAct_9fa48("152404") ? {} : (stryCov_9fa48("152404"), {
            serviceId,
            operation,
            data
          }));
          const duration = stryMutAct_9fa48("152405") ? Date.now() + startTime : (stryCov_9fa48("152405"), Date.now() - startTime);
          this.logger.debug(THREADING_LOG_MSG.OPERATION_COMPLETED, stryMutAct_9fa48("152406") ? {} : (stryCov_9fa48("152406"), {
            serviceId,
            operation,
            durationMs: duration
          }));
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("152407")) {
          {}
        } else {
          stryCov_9fa48("152407");
          const duration = stryMutAct_9fa48("152408") ? Date.now() + startTime : (stryCov_9fa48("152408"), Date.now() - startTime);
          this.logger.error(THREADING_LOG_MSG.OPERATION_FAILED, stryMutAct_9fa48("152409") ? {} : (stryCov_9fa48("152409"), {
            serviceId,
            operation,
            durationMs: duration,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Register a service in the thread pool.
   * @param {string} serviceId - The service identifier.
   * @param {Object} serviceConfig - The service configuration.
   * @return {Promise<Object>} Registration result.
   */
  async registerService(serviceId, serviceConfig = {}) {
    if (stryMutAct_9fa48("152410")) {
      {}
    } else {
      stryCov_9fa48("152410");
      if (stryMutAct_9fa48("152413") ? false : stryMutAct_9fa48("152412") ? true : stryMutAct_9fa48("152411") ? this.initialized : (stryCov_9fa48("152411", "152412", "152413"), !this.initialized)) {
        if (stryMutAct_9fa48("152414")) {
          {}
        } else {
          stryCov_9fa48("152414");
          throw new Error(THREADING_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      if (stryMutAct_9fa48("152416") ? false : stryMutAct_9fa48("152415") ? true : (stryCov_9fa48("152415", "152416"), this.services.has(serviceId))) {
        if (stryMutAct_9fa48("152417")) {
          {}
        } else {
          stryCov_9fa48("152417");
          throw new Error(THREADING_ERROR_MSG.serviceAlreadyRegistered(serviceId));
        }
      }
      const serviceInfo = stryMutAct_9fa48("152418") ? {} : (stryCov_9fa48("152418"), {
        id: serviceId,
        config: serviceConfig,
        status: SERVICE_STATUS.PENDING,
        registeredAt: Date.now(),
        lastHealthCheck: null,
        healthStatus: null
      });
      this.services.set(serviceId, serviceInfo);
      try {
        if (stryMutAct_9fa48("152419")) {
          {}
        } else {
          stryCov_9fa48("152419");
          const result = await this.executeServiceOperation(serviceId, WORKER_OPERATION.REGISTER, stryMutAct_9fa48("152420") ? {} : (stryCov_9fa48("152420"), {
            handler: stryMutAct_9fa48("152423") ? serviceConfig.handler && {} : stryMutAct_9fa48("152422") ? false : stryMutAct_9fa48("152421") ? true : (stryCov_9fa48("152421", "152422", "152423"), serviceConfig.handler || {})
          }));
          serviceInfo.status = SERVICE_STATUS.RUNNING;
          this.logger.info(THREADING_LOG_MSG.SERVICE_REGISTERED, stryMutAct_9fa48("152424") ? {} : (stryCov_9fa48("152424"), {
            serviceId
          }));
          this.emit(THREADING_EVENT.SERVICE_REGISTERED, serviceId);
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("152425")) {
          {}
        } else {
          stryCov_9fa48("152425");
          serviceInfo.status = SERVICE_STATUS.FAILED;
          this.logger.error(THREADING_LOG_MSG.SERVICE_REGISTRATION_FAILED, stryMutAct_9fa48("152426") ? {} : (stryCov_9fa48("152426"), {
            serviceId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Unregister a service from the thread pool.
   * @param {string} serviceId - The service identifier.
   * @return {Promise<Object>} Unregistration result.
   */
  async unregisterService(serviceId) {
    if (stryMutAct_9fa48("152427")) {
      {}
    } else {
      stryCov_9fa48("152427");
      if (stryMutAct_9fa48("152430") ? false : stryMutAct_9fa48("152429") ? true : stryMutAct_9fa48("152428") ? this.initialized : (stryCov_9fa48("152428", "152429", "152430"), !this.initialized)) {
        if (stryMutAct_9fa48("152431")) {
          {}
        } else {
          stryCov_9fa48("152431");
          throw new Error(THREADING_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const serviceInfo = this.services.get(serviceId);
      if (stryMutAct_9fa48("152434") ? false : stryMutAct_9fa48("152433") ? true : stryMutAct_9fa48("152432") ? serviceInfo : (stryCov_9fa48("152432", "152433", "152434"), !serviceInfo)) {
        if (stryMutAct_9fa48("152435")) {
          {}
        } else {
          stryCov_9fa48("152435");
          throw new Error(THREADING_ERROR_MSG.serviceNotFound(serviceId));
        }
      }
      serviceInfo.status = SERVICE_STATUS.STOPPING;
      try {
        if (stryMutAct_9fa48("152436")) {
          {}
        } else {
          stryCov_9fa48("152436");
          const result = await this.executeServiceOperation(serviceId, WORKER_OPERATION.UNREGISTER);
          this.services.delete(serviceId);
          this.logger.info(THREADING_LOG_MSG.SERVICE_UNREGISTERED, stryMutAct_9fa48("152437") ? {} : (stryCov_9fa48("152437"), {
            serviceId
          }));
          this.emit(THREADING_EVENT.SERVICE_UNREGISTERED, serviceId);
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("152438")) {
          {}
        } else {
          stryCov_9fa48("152438");
          serviceInfo.status = SERVICE_STATUS.FAILED;
          this.logger.error(THREADING_LOG_MSG.SERVICE_UNREGISTRATION_FAILED, stryMutAct_9fa48("152439") ? {} : (stryCov_9fa48("152439"), {
            serviceId,
            error: error.message
          }));
          throw error;
        }
      }
    }
  }

  /**
   * Get service status.
   * @param {string} serviceId - The service identifier.
   * @return {Object|null} Service status or null if not found.
   */
  getServiceStatus(serviceId) {
    if (stryMutAct_9fa48("152440")) {
      {}
    } else {
      stryCov_9fa48("152440");
      const serviceInfo = this.services.get(serviceId);
      if (stryMutAct_9fa48("152443") ? false : stryMutAct_9fa48("152442") ? true : stryMutAct_9fa48("152441") ? serviceInfo : (stryCov_9fa48("152441", "152442", "152443"), !serviceInfo)) {
        if (stryMutAct_9fa48("152444")) {
          {}
        } else {
          stryCov_9fa48("152444");
          return null;
        }
      }
      return stryMutAct_9fa48("152445") ? {} : (stryCov_9fa48("152445"), {
        id: serviceInfo.id,
        status: serviceInfo.status,
        registeredAt: serviceInfo.registeredAt,
        lastHealthCheck: serviceInfo.lastHealthCheck,
        healthStatus: serviceInfo.healthStatus
      });
    }
  }

  /**
   * Check health of a service.
   * @param {string} serviceId - The service identifier.
   * @return {Promise<Object>} Health check result.
   */
  async checkServiceHealth(serviceId) {
    if (stryMutAct_9fa48("152446")) {
      {}
    } else {
      stryCov_9fa48("152446");
      if (stryMutAct_9fa48("152449") ? false : stryMutAct_9fa48("152448") ? true : stryMutAct_9fa48("152447") ? this.initialized : (stryCov_9fa48("152447", "152448", "152449"), !this.initialized)) {
        if (stryMutAct_9fa48("152450")) {
          {}
        } else {
          stryCov_9fa48("152450");
          throw new Error(THREADING_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      const serviceInfo = this.services.get(serviceId);
      if (stryMutAct_9fa48("152453") ? false : stryMutAct_9fa48("152452") ? true : stryMutAct_9fa48("152451") ? serviceInfo : (stryCov_9fa48("152451", "152452", "152453"), !serviceInfo)) {
        if (stryMutAct_9fa48("152454")) {
          {}
        } else {
          stryCov_9fa48("152454");
          throw new Error(THREADING_ERROR_MSG.serviceNotFound(serviceId));
        }
      }
      try {
        if (stryMutAct_9fa48("152455")) {
          {}
        } else {
          stryCov_9fa48("152455");
          const result = await this.executeServiceOperation(serviceId, WORKER_OPERATION.PING);
          serviceInfo.lastHealthCheck = Date.now();
          serviceInfo.healthStatus = THREADING_HEALTH_STATUS.HEALTHY;
          return stryMutAct_9fa48("152456") ? {} : (stryCov_9fa48("152456"), {
            serviceId,
            healthy: stryMutAct_9fa48("152457") ? false : (stryCov_9fa48("152457"), true),
            ...result
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("152458")) {
          {}
        } else {
          stryCov_9fa48("152458");
          serviceInfo.lastHealthCheck = Date.now();
          serviceInfo.healthStatus = THREADING_HEALTH_STATUS.UNHEALTHY;
          return stryMutAct_9fa48("152459") ? {} : (stryCov_9fa48("152459"), {
            serviceId,
            healthy: stryMutAct_9fa48("152460") ? true : (stryCov_9fa48("152460"), false),
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Get all registered services.
   * @return {Array<Object>} Array of service status objects.
   */
  getAllServices() {
    if (stryMutAct_9fa48("152461")) {
      {}
    } else {
      stryCov_9fa48("152461");
      const services = stryMutAct_9fa48("152462") ? ["Stryker was here"] : (stryCov_9fa48("152462"), []);
      for (const [serviceId, serviceInfo] of this.services) {
        if (stryMutAct_9fa48("152463")) {
          {}
        } else {
          stryCov_9fa48("152463");
          services.push(stryMutAct_9fa48("152464") ? {} : (stryCov_9fa48("152464"), {
            id: serviceId,
            status: serviceInfo.status,
            registeredAt: serviceInfo.registeredAt,
            lastHealthCheck: serviceInfo.lastHealthCheck,
            healthStatus: serviceInfo.healthStatus
          }));
        }
      }
      return services;
    }
  }

  /**
   * Get the number of registered services.
   * @return {number} Number of registered services.
   */
  getServiceCount() {
    if (stryMutAct_9fa48("152465")) {
      {}
    } else {
      stryCov_9fa48("152465");
      return this.services.size;
    }
  }

  /**
   * Get thread pool statistics.
   * @return {Object} Pool statistics.
   */
  getPoolStats() {
    if (stryMutAct_9fa48("152466")) {
      {}
    } else {
      stryCov_9fa48("152466");
      if (stryMutAct_9fa48("152469") ? false : stryMutAct_9fa48("152468") ? true : stryMutAct_9fa48("152467") ? this.pool : (stryCov_9fa48("152467", "152468", "152469"), !this.pool)) {
        if (stryMutAct_9fa48("152470")) {
          {}
        } else {
          stryCov_9fa48("152470");
          return null;
        }
      }
      return stryMutAct_9fa48("152471") ? {} : (stryCov_9fa48("152471"), {
        threads: stryMutAct_9fa48("152474") ? this.pool.threads?.length && 0 : stryMutAct_9fa48("152473") ? false : stryMutAct_9fa48("152472") ? true : (stryCov_9fa48("152472", "152473", "152474"), (stryMutAct_9fa48("152475") ? this.pool.threads.length : (stryCov_9fa48("152475"), this.pool.threads?.length)) || 0),
        completed: stryMutAct_9fa48("152478") ? this.pool.completed && 0 : stryMutAct_9fa48("152477") ? false : stryMutAct_9fa48("152476") ? true : (stryCov_9fa48("152476", "152477", "152478"), this.pool.completed || 0),
        runTime: stryMutAct_9fa48("152481") ? this.pool.runTime && 0 : stryMutAct_9fa48("152480") ? false : stryMutAct_9fa48("152479") ? true : (stryCov_9fa48("152479", "152480", "152481"), this.pool.runTime || 0),
        waitTime: stryMutAct_9fa48("152484") ? this.pool.waitTime && 0 : stryMutAct_9fa48("152483") ? false : stryMutAct_9fa48("152482") ? true : (stryCov_9fa48("152482", "152483", "152484"), this.pool.waitTime || 0),
        queueSize: stryMutAct_9fa48("152487") ? this.pool.queueSize && 0 : stryMutAct_9fa48("152486") ? false : stryMutAct_9fa48("152485") ? true : (stryCov_9fa48("152485", "152486", "152487"), this.pool.queueSize || 0)
      });
    }
  }

  /**
   * Check if the manager is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("152488")) {
      {}
    } else {
      stryCov_9fa48("152488");
      return this.initialized;
    }
  }

  /**
   * Shutdown the thread pool and cleanup resources.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("152489")) {
      {}
    } else {
      stryCov_9fa48("152489");
      if (stryMutAct_9fa48("152492") ? false : stryMutAct_9fa48("152491") ? true : stryMutAct_9fa48("152490") ? this.initialized : (stryCov_9fa48("152490", "152491", "152492"), !this.initialized)) {
        if (stryMutAct_9fa48("152493")) {
          {}
        } else {
          stryCov_9fa48("152493");
          return;
        }
      }
      this.logger.info(THREADING_LOG_MSG.SHUTDOWN_START);
      let shutdownError = null;

      // Unregister all services
      const serviceIds = Array.from(this.services.keys());
      for (const serviceId of serviceIds) {
        if (stryMutAct_9fa48("152494")) {
          {}
        } else {
          stryCov_9fa48("152494");
          try {
            if (stryMutAct_9fa48("152495")) {
              {}
            } else {
              stryCov_9fa48("152495");
              await this.unregisterService(serviceId);
            }
          } catch (error) {
            if (stryMutAct_9fa48("152496")) {
              {}
            } else {
              stryCov_9fa48("152496");
              this.logger.warn(THREADING_LOG_MSG.SHUTDOWN_UNREGISTER_ERROR, stryMutAct_9fa48("152497") ? {} : (stryCov_9fa48("152497"), {
                serviceId,
                error: error.message
              }));
              if (stryMutAct_9fa48("152500") ? false : stryMutAct_9fa48("152499") ? true : stryMutAct_9fa48("152498") ? shutdownError : (stryCov_9fa48("152498", "152499", "152500"), !shutdownError)) {
                if (stryMutAct_9fa48("152501")) {
                  {}
                } else {
                  stryCov_9fa48("152501");
                  shutdownError = error;
                }
              }
              this.services.delete(serviceId);
            }
          }
        }
      }

      // Destroy the pool
      if (stryMutAct_9fa48("152503") ? false : stryMutAct_9fa48("152502") ? true : (stryCov_9fa48("152502", "152503"), this.pool)) {
        if (stryMutAct_9fa48("152504")) {
          {}
        } else {
          stryCov_9fa48("152504");
          try {
            if (stryMutAct_9fa48("152505")) {
              {}
            } else {
              stryCov_9fa48("152505");
              await this.pool.destroy();
            }
          } catch (error) {
            if (stryMutAct_9fa48("152506")) {
              {}
            } else {
              stryCov_9fa48("152506");
              if (stryMutAct_9fa48("152509") ? false : stryMutAct_9fa48("152508") ? true : stryMutAct_9fa48("152507") ? shutdownError : (stryCov_9fa48("152507", "152508", "152509"), !shutdownError)) {
                if (stryMutAct_9fa48("152510")) {
                  {}
                } else {
                  stryCov_9fa48("152510");
                  shutdownError = error;
                }
              }
            }
          }
          this.pool = null;
        }
      }
      this.services.clear();
      this.initialized = stryMutAct_9fa48("152511") ? true : (stryCov_9fa48("152511"), false);
      this.logger.info(THREADING_LOG_MSG.SHUTDOWN_COMPLETE);
      if (stryMutAct_9fa48("152513") ? false : stryMutAct_9fa48("152512") ? true : (stryCov_9fa48("152512", "152513"), shutdownError)) {
        if (stryMutAct_9fa48("152514")) {
          {}
        } else {
          stryCov_9fa48("152514");
          throw shutdownError;
        }
      }
    }
  }
}
export { ServiceThreadManager };
export { SERVICE_STATUS as ServiceStatus };