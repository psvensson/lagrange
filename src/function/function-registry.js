/**
 * Function Registry - Plugin registry for function executors.
 * External projects (e.g., WASM) register their executors here.
 * Requirements: 34.10, 34.11, 34.12, 34.13
 */

import {LoggingService} from '../logging/logging-service.js';
import {TABLES} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  FUNCTION_ERROR_MSG,
  FUNCTION_LOG_MSG,
  FUNCTION_SUBSYSTEM,
  FUNCTION_DEFAULT_VALUE,
  TYPEOF,
} from './function-constants.js';

/**
 * FunctionRegistry provides a plugin architecture for registering
 * function executors by type (e.g., 'wasm', 'javascript').
 */
class FunctionRegistry {
  /**
   * Create a new FunctionRegistry.
   * @param {Object} options - Configuration options.
   * @param {Object} options.systemTableCache - System table cache for function lookup.
   * @param {Object} options.cdcIntegrationService - CDC service for writes.
   */
  constructor(options = {}) {
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.executors = new Map(); // executorType → executor
    this.logger = this.initLogger();
    this.initialized = false;
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(FUNCTION_SUBSYSTEM.REGISTRY);
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Initialize the function registry.
   * @param {Object} options - Initialization options.
   * @param {Object} options.systemTableCache - System table cache.
   * @param {Object} options.cdcIntegrationService - CDC integration service.
   */
  initialize(options = {}) {
    if (options.systemTableCache) {
      this.systemTableCache = options.systemTableCache;
    }
    if (options.cdcIntegrationService) {
      this.cdcIntegrationService = options.cdcIntegrationService;
    }

    this.initialized = true;

    this.logger.info(FUNCTION_LOG_MSG.REGISTRY_INITIALIZED, {
      registeredExecutors: this.getRegisteredExecutorTypes(),
    });
  }

  /**
   * Register a function executor for a given type.
   * @param {string} executorType - Type identifier (e.g., 'wasm', 'javascript').
   * @param {Object} executor - Executor with execute(func, context, args) method.
   * @throws {Error} If executor is invalid.
   */
  registerExecutor(executorType, executor) {
    if (!executorType || typeof executorType !== TYPEOF.STRING) {
      throw new Error(FUNCTION_ERROR_MSG.EXECUTOR_TYPE_REQUIRED);
    }

    if (!executor || typeof executor.execute !== TYPEOF.FUNCTION) {
      throw new Error(FUNCTION_ERROR_MSG.EXECUTOR_METHOD_REQUIRED);
    }

    if (this.executors.has(executorType)) {
      this.logger.warn(FUNCTION_LOG_MSG.EXECUTOR_OVERWRITE, {executorType});
    }

    this.executors.set(executorType, executor);

    this.logger.info(FUNCTION_LOG_MSG.EXECUTOR_REGISTERED, {
      executorType,
      executorName: executor.name || FUNCTION_DEFAULT_VALUE.EXECUTOR_NAME_FALLBACK,
    });
  }

  /**
   * Unregister a function executor.
   * @param {string} executorType - Type identifier to unregister.
   * @return {boolean} True if executor was removed.
   */
  unregisterExecutor(executorType) {
    const existed = this.executors.has(executorType);
    this.executors.delete(executorType);

    if (existed) {
      this.logger.info(FUNCTION_LOG_MSG.EXECUTOR_UNREGISTERED, {executorType});
    }

    return existed;
  }

  /**
   * Invoke a function by ID.
   * @param {string} functionId - ID of function to invoke.
   * @param {Object} context - Execution context.
   * @param {Object} args - Arguments to pass to function.
   * @return {Promise<*>} Function result.
   */
  async invoke(functionId, context = {}, args = {}) {
    // Look up function definition from code table
    const func = await this.getFunction(functionId);

    if (!func) {
      throw new Error(`${FUNCTION_ERROR_MSG.FUNCTION_NOT_FOUND_PREFIX}${functionId}`);
    }

    // Get executor for this function type
    const executor = this.executors.get(func.executor_type);

    if (!executor) {
      const availableTypes = this.getRegisteredExecutorTypes();
      const availableStr = availableTypes.length > 0 ?
        availableTypes.join(', ') : FUNCTION_ERROR_MSG.EXECUTOR_AVAILABLE_NONE;
      throw new Error(
        `${FUNCTION_ERROR_MSG.EXECUTOR_NOT_FOUND_PREFIX}` +
        `'${func.executor_type}'` +
        `${FUNCTION_ERROR_MSG.EXECUTOR_NOT_FOUND_SUFFIX} ` +
        `${FUNCTION_ERROR_MSG.EXECUTOR_AVAILABLE_PREFIX}${availableStr}`,
      );
    }

    this.logger.debug(FUNCTION_LOG_MSG.INVOKING_FUNCTION, {
      functionId,
      functionName: func.function_name,
      executorType: func.executor_type,
    });

    // Execute the function
    const result = await executor.execute(func, context, args);

    this.logger.debug(FUNCTION_LOG_MSG.FUNCTION_COMPLETED, {
      functionId,
      hasResult: result !== undefined,
    });

    return result;
  }

  /**
   * Invoke a function by name (convenience method).
   * @param {string} functionName - Name of function to invoke.
   * @param {Object} context - Execution context.
   * @param {Object} args - Arguments to pass to function.
   * @return {Promise<*>} Function result.
   */
  async invokeByName(functionName, context = {}, args = {}) {
    const func = await this.getFunctionByName(functionName);

    if (!func) {
      throw new Error(`${FUNCTION_ERROR_MSG.FUNCTION_NOT_FOUND_PREFIX}${functionName}`);
    }

    return this.invoke(func.function_id, context, args);
  }

  /**
   * Get a function by ID from the code table.
   * @param {string} functionId - Function ID.
   * @return {Promise<Object|null>} Function definition or null.
   */
  async getFunction(functionId) {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      FUNCTION_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    try {
      // Try direct lookup first
      const func = systemTableCache.get(TABLES.CODE, functionId);
      if (func) {
        return func;
      }

      // Try find by function_id field
      return systemTableCache.find(TABLES.CODE, (f) =>
        f.function_id === functionId,
      );
    } catch (error) {
      this.logger.error(FUNCTION_LOG_MSG.FUNCTION_LOOKUP_FAILED, {
        functionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get a function by name from the code table.
   * @param {string} functionName - Function name.
   * @return {Promise<Object|null>} Function definition or null.
   */
  async getFunctionByName(functionName) {
    const systemTableCache = assertCritical(
      this.systemTableCache,
      FUNCTION_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    try {
      return systemTableCache.find(TABLES.CODE, (f) =>
        f.function_name === functionName,
      );
    } catch (error) {
      this.logger.error(FUNCTION_LOG_MSG.FUNCTION_LOOKUP_BY_NAME_FAILED, {
        functionName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * List all registered executor types.
   * @return {Array<string>} Array of executor type names.
   */
  getRegisteredExecutorTypes() {
    return Array.from(this.executors.keys());
  }

  /**
   * Check if an executor is registered for a type.
   * @param {string} executorType - Executor type to check.
   * @return {boolean} True if registered.
   */
  hasExecutor(executorType) {
    return this.executors.has(executorType);
  }

  /**
   * Get the count of registered executors.
   * @return {number} Number of registered executors.
   */
  getExecutorCount() {
    return this.executors.size;
  }

  /**
   * Check if registry is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }
}

export {FunctionRegistry};
