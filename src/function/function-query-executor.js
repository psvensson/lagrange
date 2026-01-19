/**
 * Function Query Executor - Internal API for programmatic query execution.
 * Used by function executors to run queries on behalf of user functions.
 * Requirements: 34.6, 34.7, 34.8, 34.9
 */

import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * FunctionQueryExecutor provides programmatic query execution for
 * internal services and future function executors.
 */
class FunctionQueryExecutor {
  /**
   * Create a new FunctionQueryExecutor.
   * @param {Object} options - Configuration options.
   * @param {Object} options.sqlQueryEngine - SQL query engine for execution.
   * @param {Object} options.functionRegistry - Function registry for invocations.
   */
  constructor(options = {}) {
    this.sqlQueryEngine = options.sqlQueryEngine || null;
    this.functionRegistry = options.functionRegistry || null;
    this.logger = this.initLogger();

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.defaultTimeoutMs = config.get('function.queryTimeoutMs') || 30000;
    this.defaultBatchSize = config.get('function.queryBatchSize') || 100;

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
        return loggingService.forSubsystem('function-query-executor');
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Initialize the query executor.
   * @param {Object} options - Initialization options.
   * @param {Object} options.sqlQueryEngine - SQL query engine.
   * @param {Object} options.functionRegistry - Function registry.
   */
  initialize(options = {}) {
    if (options.sqlQueryEngine) {
      this.sqlQueryEngine = options.sqlQueryEngine;
    }
    if (options.functionRegistry) {
      this.functionRegistry = options.functionRegistry;
    }

    this.initialized = true;

    this.logger.info('Function query executor initialized');
  }

  /**
   * Execute a query and return results directly.
   * @param {string} sql - SQL statement to execute.
   * @param {Array} params - Query parameters.
   * @param {Object} options - Execution options.
   * @param {number} options.timeout - Query timeout in milliseconds.
   * @return {Promise<Object>} Query result with rows, affectedRows, partitions.
   */
  async executeQuery(sql, params = [], options = {}) {
    if (!this.sqlQueryEngine) {
      throw new Error('SQL query engine not available');
    }

    const timeout = options.timeout || this.defaultTimeoutMs;
    const startTime = Date.now();

    this.logger.debug('Executing query via FunctionQueryExecutor', {
      sql: sql.substring(0, 100),
      paramCount: params.length,
      timeout,
    });

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Query timeout after ${timeout}ms`)),
        timeout,
      );
    });

    try {
      const result = await Promise.race([
        this.sqlQueryEngine.executeQuery(sql, params),
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;

      this.logger.debug('Query executed successfully', {
        sql: sql.substring(0, 100),
        rowCount: result.results?.length || result.rows?.length || 0,
        affectedRows: result.affectedRows || 0,
        durationMs: duration,
      });

      return {
        rows: result.results || result.rows || [],
        affectedRows: result.affectedRows || 0,
        partitions: result.partitions || [],
        success: true,
      };
    } catch (error) {
      this.logger.error('Query execution failed', {
        sql: sql.substring(0, 100),
        error: error.message,
      });
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Execute a query with streaming callback for large result sets.
   * @param {string} sql - SQL statement to execute.
   * @param {Array} params - Query parameters.
   * @param {Function} callback - Called for each batch of rows.
   * @param {Object} options - Execution options.
   * @param {number} options.batchSize - Number of rows per batch.
   * @return {Promise<Object>} Completion result with total row count.
   */
  async executeQueryWithCallback(sql, params, callback, options = {}) {
    if (!this.sqlQueryEngine) {
      throw new Error('SQL query engine not available');
    }

    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    const batchSize = options.batchSize || this.defaultBatchSize;
    const startTime = Date.now();

    this.logger.debug('Executing streaming query', {
      sql: sql.substring(0, 100),
      batchSize,
    });

    // Check if engine supports streaming
    if (typeof this.sqlQueryEngine.executeStreaming === 'function') {
      let totalRows = 0;

      await this.sqlQueryEngine.executeStreaming(sql, params, async (rows) => {
        totalRows += rows.length;
        await callback(rows);
      }, {batchSize});

      const duration = Date.now() - startTime;

      this.logger.debug('Streaming query completed', {
        sql: sql.substring(0, 100),
        totalRows,
        durationMs: duration,
      });

      return {
        totalRows,
        success: true,
      };
    }

    // Fallback: execute full query and batch results
    const result = await this.executeQuery(sql, params, options);
    const rows = result.rows || [];

    let totalRows = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      totalRows += batch.length;
      await callback(batch);
    }

    const duration = Date.now() - startTime;

    this.logger.debug('Batched query completed', {
      sql: sql.substring(0, 100),
      totalRows,
      durationMs: duration,
    });

    return {
      totalRows,
      success: true,
    };
  }

  /**
   * Execute a query and invoke a function with the results.
   * This is the continuation-passing pattern for async workflows.
   * @param {string} sql - SQL statement to execute.
   * @param {Array} params - Query parameters.
   * @param {string} nextFunctionId - Function to invoke with results.
   * @param {Object} nextFunctionContext - Context to pass to next function.
   * @return {Promise<Object>} Result with invocationId.
   */
  async executeQueryThenInvoke(sql, params, nextFunctionId, nextFunctionContext = {}) {
    if (!this.functionRegistry) {
      throw new Error('Function registry not available');
    }

    const invocationId = uuidv4();
    const startTime = Date.now();

    this.logger.info('Executing query then invoke', {
      invocationId,
      sql: sql.substring(0, 100),
      nextFunctionId,
    });

    // Execute query
    const result = await this.executeQuery(sql, params);

    // Invoke the next function with query results
    try {
      await this.functionRegistry.invoke(nextFunctionId, {
        ...nextFunctionContext,
        queryResult: result,
        invocationId,
      });

      const duration = Date.now() - startTime;

      this.logger.info('Query completed, function invoked', {
        invocationId,
        nextFunctionId,
        rowCount: result.rows?.length || 0,
        durationMs: duration,
      });

      return {
        invocationId,
        queryResult: result,
        functionInvoked: true,
        success: true,
      };
    } catch (error) {
      this.logger.error('Function invocation failed after query', {
        invocationId,
        nextFunctionId,
        error: error.message,
      });

      return {
        invocationId,
        queryResult: result,
        functionInvoked: false,
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Check if executor is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }
}

export {FunctionQueryExecutor};
