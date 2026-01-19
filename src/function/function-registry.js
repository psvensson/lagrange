/**
 * Function Registry - Plugin registry for function executors.
 * External projects (e.g., WASM) register their executors here.
 * Requirements: 34.10, 34.11, 34.12, 34.13
 */

import {LoggingService} from '../logging/logging-service.js';

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
        return loggingService.forSubsystem('function-registry');
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

    this.logger.info('Function registry initialized', {
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
    if (!executorType || typeof executorType !== 'string') {
      throw new Error('Executor type must be a non-empty string');
    }

    if (!executor || typeof executor.execute !== 'function') {
      throw new Error('Executor must have an execute(func, context, args) method');
    }

    if (this.executors.has(executorType)) {
      this.logger.warn('Overwriting existing executor', {executorType});
    }

    this.executors.set(executorType, executor);

    this.logger.info('Function executor registered', {
      executorType,
      executorName: executor.name || 'anonymous',
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
      this.logger.info('Function executor unregistered', {executorType});
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
      throw new Error(`Function not found: ${functionId}`);
    }

    // Get executor for this function type
    const executor = this.executors.get(func.executor_type);

    if (!executor) {
      const availableTypes = this.getRegisteredExecutorTypes();
      throw new Error(
        `No executor registered for type '${func.executor_type}'. ` +
        `Available types: ${availableTypes.length > 0 ? availableTypes.join(', ') : 'none'}`,
      );
    }

    this.logger.debug('Invoking function', {
      functionId,
      functionName: func.function_name,
      executorType: func.executor_type,
    });

    // Execute the function
    const result = await executor.execute(func, context, args);

    this.logger.debug('Function completed', {
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
      throw new Error(`Function not found: ${functionName}`);
    }

    return this.invoke(func.function_id, context, args);
  }

  /**
   * Get a function by ID from the code table.
   * @param {string} functionId - Function ID.
   * @return {Promise<Object|null>} Function definition or null.
   */
  async getFunction(functionId) {
    if (!this.systemTableCache) {
      this.logger.warn('System table cache not available');
      return null;
    }

    try {
      // Try direct lookup first
      const func = this.systemTableCache.get('code', functionId);
      if (func) {
        return func;
      }

      // Try find by function_id field
      return this.systemTableCache.find('code', (f) =>
        f.function_id === functionId,
      );
    } catch (error) {
      this.logger.error('Failed to get function', {
        functionId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get a function by name from the code table.
   * @param {string} functionName - Function name.
   * @return {Promise<Object|null>} Function definition or null.
   */
  async getFunctionByName(functionName) {
    if (!this.systemTableCache) {
      this.logger.warn('System table cache not available');
      return null;
    }

    try {
      return this.systemTableCache.find('code', (f) =>
        f.function_name === functionName,
      );
    } catch (error) {
      this.logger.error('Failed to get function by name', {
        functionName,
        error: error.message,
      });
      return null;
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
